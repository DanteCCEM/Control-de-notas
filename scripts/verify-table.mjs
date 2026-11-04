// Production-bundle QA with system Chrome and a disposable browser profile.
// Start Vite preview first. No user's browser profile or deployed URL is accessed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:4173";
const executable =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));
if (!executable)
  throw Error(
    "Configura CHROME_PATH con la ruta del navegador Chrome/Edge instalado.",
  );
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "notas-table-qa-"));
const browser = spawn(
  executable,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket, call;
const pending = new Map();
let sequence = 0;
const errors = [],
  external = [],
  failedResources = [];
try {
  let port;
  for (let n = 0; n < 100; n++) {
    try {
      port = fs
        .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
        .split("\n")[0];
      break;
    } catch {
      await pause(100);
    }
  }
  assert(port, "No se pudo iniciar el navegador de QA");
  const pages = await (
    await fetch("http://127.0.0.1:" + port + "/json")
  ).json();
  socket = new WebSocket(
    pages.find((p) => p.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const task = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) task?.reject(Error(JSON.stringify(m.error)));
      else task?.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails.text);
    else if (
      m.method === "Network.requestWillBeSent" &&
      /^https?:/.test(m.params.request.url) &&
      !m.params.request.url.startsWith(base + "/")
    )
      external.push(m.params.request.url);
    else if (
      m.method === "Network.responseReceived" &&
      m.params.response.status >= 400 &&
      !m.params.response.url.endsWith("/favicon.ico")
    )
      failedResources.push(m.params.response.url);
  };
  call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const waitFor = async (expression) => {
    for (let n = 0; n < 160; n++) {
      try {
        if (await evaluate(expression)) return;
      } catch {}
      await pause(50);
    }
    throw Error("Timeout: " + expression);
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Page.navigate", { url: base + "/aero-landscape.svg" });
  await waitFor('location.pathname==="/aero-landscape.svg"');
  // Build a real version-1 database before the app starts, to exercise the upgrade.
  const names = [
    "Curso con nombre largo para comprobar que ninguna columna se desplaza al cambiar de computadora",
    "X".repeat(120),
    "Taller de Proyectos 2",
    "Investigación con ponderaciones distintas",
    "Metodologías Ágiles de Desarrollo",
    "Planeamiento Estratégico",
  ];
  const fixture = names.map((name, i) => ({
    id: String.fromCharCode(102 - i) + "-course",
    name,
    weights: i % 2 ? [20, 25, 20, 35] : [20, 20, 20, 40],
    grades: [
      { value: i + 0.25, locked: i % 2 === 0 },
      { value: null, locked: true },
      { value: 0, locked: false },
      { value: 19.75, locked: true },
    ],
  }));
  const settings = { id: "main", threshold: 11, dark: false };
  await evaluate(
    `new Promise((resolve,reject)=>{const request=indexedDB.open('MiControlDeNotas',10);request.onupgradeneeded=()=>{request.result.createObjectStore('courses',{keyPath:'id'});request.result.createObjectStore('settings',{keyPath:'id'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['courses','settings'],'readwrite');for(const c of ${JSON.stringify(fixture)})tx.objectStore('courses').put(c);tx.objectStore('settings').put(${JSON.stringify(settings)});tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>reject(tx.error);};})`,
  );
  await call("Page.navigate", { url: base + "/#notas" });
  await waitFor('document.querySelectorAll("tbody tr").length===6');
  await pause(450);
  const read = () =>
    evaluate(
      `new Promise((resolve,reject)=>{const request=indexedDB.open('MiControlDeNotas');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['courses','settings'],'readonly');const records=tx.objectStore('courses').getAll(),config=tx.objectStore('settings').get('main');tx.oncomplete=()=>{const result={version:db.version,courses:records.result,settings:config.result};db.close();resolve(result);};};})`,
    );
  const migrated = await read();
  assert.equal(migrated.version, 40);
  assert.deepEqual(migrated.settings, settings);
  const expected = [...fixture].sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(
    migrated.courses.map(({ order, ...c }) => c),
    expected,
  );
  assert.deepEqual(
    migrated.courses.map((c) => c.order),
    [0, 1, 2, 3, 4, 5],
  );
  const matrix = [];
  const resolutions = [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [1280, 720],
    [768, 1024],
    [390, 844],
  ];
  for (const [width, height] of resolutions)
    for (const zoom of [0.75, 1, 1.25, 1.5]) {
      // Browser zoom changes the CSS viewport and device pixel ratio together.
      const cssWidth = Math.round(width / zoom),
        cssHeight = Math.round(height / zoom);
      await call("Emulation.setDeviceMetricsOverride", {
        width: cssWidth,
        height: cssHeight,
        deviceScaleFactor: zoom,
        mobile: false,
      });
      await pause(120);
      const result = await evaluate(`(()=>{
   const problems=[],table=document.querySelector('.grades-table'),region=document.querySelector('.table-scroll');region.scrollLeft=0;
   const headers=[...table.querySelectorAll('th')].map(h=>h.getBoundingClientRect()),rows=[...table.querySelectorAll('tbody tr')],expected=${JSON.stringify(expected)};
   if(document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1)problems.push('Desbordamiento de la página');
   if(getComputedStyle(table).tableLayout!=='fixed')problems.push('Tabla de ancho automático');
   rows.forEach((row,r)=>{const c=expected[r];if(row.dataset.courseId!==c.id)problems.push('Orden incorrecto');
    [...row.cells].forEach((cell,j)=>{const b=cell.getBoundingClientRect();if(Math.abs(b.x-headers[j].x)>.6||Math.abs(b.width-headers[j].width)>.6)problems.push('Columna desalineada');});
    [...row.querySelectorAll('.grade')].forEach((g,i)=>{const input=g.querySelector('input'),button=g.querySelector('button'),b=g.getBoundingClientRect(),ib=input.getBoundingClientRect(),bb=button.getBoundingClientRect(),cb=g.closest('td').getBoundingClientRect();
     if(input.value!==(c.grades[i].value===null?'':String(c.grades[i].value))||input.disabled!==c.grades[i].locked)problems.push('Nota o candado en casilla incorrecta');
     if(ib.right>bb.left+.5||bb.right>b.right+.5||b.right>cb.right+.5||Math.abs(b.width-99)>.5)problems.push('Campo/candado fuera de columna');
     if(g.closest('td').querySelector('.weight').textContent!==c.weights[i]+'%')problems.push('Peso incorrecto');
    });
   });
   const overflows=region.scrollWidth>region.clientWidth+1;if(overflows){region.scrollLeft=99999;if(region.scrollLeft<=0)problems.push('Tabla sin desplazamiento interno');}region.scrollLeft=0;
   return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,tableWidth:table.getBoundingClientRect().width,regionWidth:region.clientWidth,horizontalScroll:overflows,problems};
  })()`);
      assert.deepEqual(
        result.problems,
        [],
        width + "x" + height + " @ " + zoom + ": " + result.problems.join(", "),
      );
      matrix.push({
        resolution: width + "x" + height,
        zoom,
        cssViewport: cssWidth,
        ...result,
      });
      if (zoom === 1) {
        await evaluate(
          'document.querySelector(".table-scroll").scrollIntoView({block:"start"});window.scrollBy(0,-16)',
        );
        await pause(100);
        fs.mkdirSync(".launcher", { recursive: true });
        fs.writeFileSync(
          ".launcher/table-" + width + ".png",
          Buffer.from((await call("Page.captureScreenshot")).data, "base64"),
        );
      }
    }
  assert.deepEqual(
    await read(),
    migrated,
    "Los cambios de viewport no deben escribir datos",
  );
  await call("Page.reload");
  await waitFor('!!document.querySelector(".splash-screen")');
  await waitFor('document.querySelectorAll("tbody tr").length===6');
  assert.deepEqual(
    await read(),
    migrated,
    "Los datos deben conservarse al recargar",
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll("tbody tr")].map(r=>r.dataset.courseId)',
    ),
    expected.map((c) => c.id),
  );
  // Stage 1 regression checks run only against this disposable profile.
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate('location.hash="#"');
  await waitFor('!!document.querySelector(".home-page")');
  assert.equal(await evaluate('document.querySelector("header strong").textContent'), "Inicio");
  assert.equal(await evaluate('document.querySelectorAll(".home-module.planned").length'), 3);
  assert.equal(await evaluate('document.querySelectorAll(".home-module.planned a,.home-module.planned button").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll("a.home-module").length'), 3);
  await evaluate(`document.querySelector('a.home-module[href="#configuracion"]').click()`);
  await waitFor('!!document.querySelector(".home-settings")');
  assert.equal(await evaluate('document.querySelector("header strong").textContent'), "Configuración");
  await evaluate('document.querySelector(".home-back").click()');
  await waitFor('!!document.querySelector(".home-page")');
  await evaluate(`document.querySelector('a.home-module[href="#notas"]').click()`);
  await waitFor('document.querySelectorAll("tbody tr").length===6');
  await evaluate('document.querySelectorAll(".course-order-arrows button")[1].click()');
  await waitFor(`document.querySelector("tbody tr").dataset.courseId===${JSON.stringify(expected[1].id)}`);
  const moved = await read();
  assert.deepEqual(moved.courses.map(({ order, ...course }) => course), migrated.courses.map(({ order, ...course }) => course));
  await evaluate('document.querySelector("tbody tr .icon").click()');
  await waitFor('!!document.querySelector(".course-color-picker")');
  await evaluate('document.querySelector("button[aria-label=Lavanda]").click()');
  await waitFor('document.querySelector("button[aria-label=Lavanda]").getAttribute("aria-pressed")==="true"');
  await evaluate('document.querySelector(".modal form").requestSubmit()');
  await waitFor('!document.querySelector(".modal")');
  const colored = await read();
  const changed = colored.courses.find(course => course.id === expected[1].id);
  assert.equal(changed.color, "#8d5ca3");
  assert.deepEqual(changed.grades, expected[1].grades);
  assert.deepEqual(changed.weights, expected[1].weights);
  await call("Page.reload");
  await waitFor('document.querySelectorAll("tbody tr").length===6');
  assert.deepEqual(await read(), colored);
  // Actual native mouse/touch input exercises pointer capture, not synthetic events.
  for (const touch of [false, true]) {
    await call("Emulation.setDeviceMetricsOverride", { width: touch ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: touch });
    await call("Emulation.setTouchEmulationEnabled", { enabled: touch });
    await evaluate('document.querySelector("tbody tr").scrollIntoView({block:"start"});window.scrollBy(0,-80)');
    const before = await evaluate('[...document.querySelectorAll("tbody tr")].map(row=>row.dataset.courseId)');
    const points = await evaluate('[...document.querySelectorAll(".course-drag-handle")].slice(0,2).map(handle=>{const r=handle.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})');
    if (touch) {
      await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
      await call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [points[1]] });
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await call("Input.dispatchMouseEvent", { type: "mousePressed", ...points[0], button: "left", clickCount: 1 });
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...points[1], button: "left", buttons: 1 });
      await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...points[1], button: "left", clickCount: 1 });
    }
    await waitFor(`document.querySelector("tbody tr").dataset.courseId===${JSON.stringify(before[1])}`);
  }
  await evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('MiControlDeNotas');request.onsuccess=()=>{const database=request.result,tx=database.transaction('scheduleEntries','readwrite');tx.objectStore('scheduleEntries').put({id:'qa-session',courseId:${JSON.stringify(expected[1].id)},day:0,startMinute:480,endMinute:540,location:'QA-201',teacher:'QA',modality:'presencial',meetingUrl:'',notes:''});tx.oncomplete=()=>{database.close();resolve(true)};tx.onerror=()=>reject(tx.error)};request.onerror=()=>reject(request.error)})`);
  const responsive = [];
  for (const width of [320, 390, 768, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    for (const hash of ["#", "#configuracion", "#horario"]) {
      await evaluate(`location.hash=${JSON.stringify(hash)}`);
      await waitFor(hash === "#" ? '!!document.querySelector(".home-page")' : hash === "#horario" ? '!!document.querySelector(".class-block")' : '!!document.querySelector(".home-settings")');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true, `Overflow ${width} ${hash}`);
      if (hash === "#horario") assert.equal(await evaluate('document.querySelector(".class-block").style.getPropertyValue("--session-accent")'), "#8d5ca3");
      responsive.push({ width, hash });
    }
  }
  const setField = async (selector, value) => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('change',{bubbles:true}));element.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const readSchedule = () => evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('MiControlDeNotas');request.onsuccess=()=>{const database=request.result,tx=database.transaction('scheduleEntries','readonly'),records=tx.objectStore('scheduleEntries').getAll();tx.oncomplete=()=>{database.close();resolve(records.result)};tx.onerror=()=>reject(tx.error)};request.onerror=()=>reject(request.error)})`);
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Agregar sesión')).click()`);
  await waitFor('!!document.querySelector(".schedule-editor")');
  await setField('.schedule-editor fieldset select', 'weekly');
  await waitFor('!!document.querySelector(".schedule-editor input[type=number]")');
  await setField('.schedule-editor input[type=date]', '2026-12-29');
  await evaluate('document.querySelector(".schedule-editor").requestSubmit()');
  await waitFor('!document.querySelector(".modal")');
  let series = (await readSchedule()).find(s => s.recurrence);
  assert.equal(series.recurrence.weeks, 16);
  assert.equal(series.date, '2026-12-29');
  assert.equal((await readSchedule()).length, 2, 'A series must occupy one record');
  await setField('.range-controls input[type=date]', '2026-12-29');
  await waitFor(`!![...document.querySelectorAll('.class-block')].find(block=>block.getAttribute('aria-label')?.includes('Martes'))`);
  await evaluate(`[...document.querySelectorAll('.class-block')].find(block=>block.getAttribute('aria-label')?.includes('Martes')).click()`);
  await waitFor('!!document.querySelector("input[name=edit-scope]")');
  await setField('.schedule-editor input[placeholder]', 'Aula excepción');
  await evaluate('document.querySelector(".schedule-editor").requestSubmit()');
  await waitFor('!document.querySelector(".modal")');
  series = (await readSchedule()).find(s => s.recurrence);
  assert.equal(series.recurrence.exceptions['0'].override.location, 'Aula excepción');
  assert.equal(series.location, '');
  await evaluate(`document.querySelector('.stored-series').open=true;[...document.querySelectorAll('.stored-series button')].find(button=>button.textContent==='Editar serie').click()`);
  await waitFor('!!document.querySelector(".schedule-editor")');
  await setField('.schedule-editor input[placeholder]', 'Aula serie');
  await evaluate('document.querySelector(".schedule-editor").requestSubmit()');
  await waitFor('!document.querySelector(".modal")');
  series = (await readSchedule()).find(s => s.recurrence);
  assert.equal(series.location, 'Aula serie');
  assert.equal(series.recurrence.exceptions['0'].override.location, 'Aula excepción');
  await call('Page.reload');
  await waitFor('!!document.querySelector(".stored-series")');
  assert.deepEqual((await readSchedule()).find(s=>s.recurrence), series);
  await setField('.range-controls input[type=date]', '2026-12-29');
  await waitFor(`!![...document.querySelectorAll('.sessions-list .session-row')].find(row=>row.textContent.includes('2026-12-29'))`);
  await evaluate(`window.confirm=()=>true;[...document.querySelectorAll('.sessions-list .session-row')].find(row=>row.textContent.includes('2026-12-29')).querySelector('button[aria-label^=Eliminar]').click()`);
  await waitFor('!!document.querySelector("#delete-series-title")');
  await evaluate(`[...document.querySelectorAll('.modal button')].find(button=>button.textContent==='Solo esta clase').click()`);
  await waitFor('!document.querySelector(".modal")');
  assert.equal((await readSchedule()).find(s=>s.recurrence).recurrence.exceptions['0'].cancelled, true);
  await evaluate(`document.querySelector('.stored-series').open=true;[...document.querySelectorAll('.stored-series button')].find(button=>button.textContent==='Eliminar serie').click()`);
  await waitFor(`![...document.querySelectorAll('.stored-series button')].some(button=>button.textContent==='Eliminar serie')`);
  assert.equal((await readSchedule()).length, 1);
  const coursesBeforeTheme = (await read()).courses;
  await evaluate(`document.querySelector('button[aria-label="Alternar modo claro y oscuro"]').click()`);
  await waitFor('document.documentElement.classList.contains("dark")');
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.deepEqual(await evaluate(`(()=>{const block=document.querySelector('.class-block'),style=getComputedStyle(block);return {background:style.backgroundColor,text:style.color,shadow:style.textShadow,iconFilter:getComputedStyle(block.querySelector('svg')).filter}})()`),
    { background: 'rgb(44, 53, 81)', text: 'rgb(237, 247, 255)', shadow: 'none', iconFilter: 'none' });
  fs.writeFileSync('.launcher/schedule-dark.png', Buffer.from((await call('Page.captureScreenshot')).data, 'base64'));
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('.day-tabs button').click()`);
  await waitFor('!!document.querySelector(".daily-session")');
  assert.deepEqual(await evaluate(`(()=>{const style=getComputedStyle(document.querySelector('.daily-session'));return {background:style.backgroundColor,text:style.color,shadow:style.textShadow}})()`),
    { background: 'rgb(44, 53, 81)', text: 'rgb(237, 247, 255)', shadow: 'none' });
  await evaluate(`document.querySelector('button[aria-label="Alternar modo claro y oscuro"]').click()`);
  await waitFor('!document.documentElement.classList.contains("dark")');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.class-block')).color`), 'rgb(21, 60, 87)');
  assert.deepEqual((await read()).courses, coursesBeforeTheme);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(failedResources, []);
  fs.writeFileSync(
    ".launcher/table-qa-results.json",
    JSON.stringify(
      {
        matrix,
        migrationPreserved: true,
        reloadPreserved: true,
        stage1NavigationColorsAndNativeDrag: true,
        responsive,
        recurringSeriesLifecycle: true,
        scheduleDarkAndLightThemes: true,
        errors,
        external,
        failedResources,
        profile,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        cases: matrix.length,
        resolutions,
        zoom: [0.75, 1, 1.25, 1.5],
        migrationPreserved: true,
        reloadPreserved: true,
        errors,
        external,
        failedResources,
      },
      null,
      2,
    ),
  );
} finally {
  if (socket?.readyState === 1) {
    try {
      await call("Browser.close");
    } catch {}
    socket.close();
  }
  browser.kill();
}

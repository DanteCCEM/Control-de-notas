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
  await call("Page.navigate", { url: base + "/" });
  await waitFor('document.querySelectorAll("tbody tr").length===6');
  await pause(450);
  const read = () =>
    evaluate(
      `new Promise((resolve,reject)=>{const request=indexedDB.open('MiControlDeNotas');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['courses','settings'],'readonly');const records=tx.objectStore('courses').getAll(),config=tx.objectStore('settings').get('main');tx.oncomplete=()=>{const result={version:db.version,courses:records.result,settings:config.result};db.close();resolve(result);};};})`,
    );
  const migrated = await read();
  assert.equal(migrated.version, 20);
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

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const address = 'http://127.0.0.1:5173/';
const noBrowser = process.argv.includes('--no-browser');
async function ready() {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(1500) });
    const html = await response.text();
    if (!html.includes('<title>Mi Control de Notas</title>')) throw new Error('El puerto 5173 esta ocupado por otra aplicacion.');
    return response.ok;
  } catch (error) {
    if (error.message.includes('ocupado')) throw error;
    return false;
  }
}
try {
  if (!await ready()) {
    const vite = path.join(directory, 'node_modules/vite/bin/vite.js');
    if (!fs.existsSync(vite)) throw new Error('Faltan dependencias. Ejecuta npm.cmd install en la carpeta del proyecto.');
    const logs = path.join(directory, '.launcher');
    fs.mkdirSync(logs, { recursive: true });
    const output = fs.openSync(path.join(logs, 'servidor.log'), 'a');
    const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: directory, detached: true, windowsHide: true, stdio: ['ignore', output, output] });
    child.on('error', error => fs.appendFileSync(path.join(logs, 'servidor.log'), String(error)));
    child.unref();
    fs.closeSync(output);
    let started = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await ready()) { started = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!started) throw new Error('No se pudo iniciar. Revisa .launcher/servidor.log. El puerto 5173 debe estar libre.');
  }
  if (!noBrowser) spawn('explorer.exe', [address], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  console.log('Aplicacion disponible en ' + address);
} catch (error) {
  fs.mkdirSync(path.join(directory, '.launcher'), { recursive: true });
  fs.writeFileSync(path.join(directory, '.launcher/error.txt'), error.message);
  if (!noBrowser) spawn('notepad.exe', [path.join(directory, '.launcher/error.txt')], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
  console.error(error.message);
  process.exitCode = 1;
}

# Rediseño Frutiger Aero

El rediseño conserva React, Vite, Tailwind y Lucide sin agregar dependencias.

## Archivos modificados

- `src/style.css`: sistema de tokens de color, cristal, transparencias, bordes, reflejos y botones glossy; ventana principal, tabla, candados azules/dorados, formularios Aero y temas claro/nocturno. Adaptación responsive, foco visible, movimiento reducido y colores forzados. No hay animaciones continuas. Los desenfoques se limitan al marco y los modales y se desactivan en el marco móvil.
- `src/App.tsx`: presentación de las seis estadísticas en tarjetas independientes. Se reutilizan los valores y expresiones existentes; se añade únicamente el icono Lucide de desaprobados.
- `public/aero-landscape.svg`: paisaje vectorial local con cielo, nubes, agua, colinas, ondas, reflejos y burbujas. Se sirve desde localhost, sin descargas externas.
- `vite.config.ts`: se excluye `.launcher/` del observador de archivos. Durante QA, los archivos de Chrome bloqueados dentro de esa carpeta causaban un error EBUSY; el perfil de QA también se trasladó al directorio temporal de Windows.
- `README.md`: referencia a esta documentación.

## Conservación de datos y lógica

Se compararon los hashes SHA-256 antes y después: `services/db.ts`, `utils/grades.ts`, `components/GradeCell.tsx`, `components/Modal.tsx`, `hooks/useData.ts`, `types/index.ts` y `app.test.tsx` permanecen idénticos. Se conserva IndexedDB versión 1 con tablas `courses` y `settings`; no se añade ninguna migración ni se cambia la inicialización. Los algoritmos, pesos iniciales, eventos de clic/doble clic y funciones de respaldo no se modificaron.

Las comprobaciones de navegador se ejecutaron en perfiles temporales independientes. No se abrió ni modificó la base de datos del navegador habitual del usuario.

## Verificación

- `npm.cmd test`: las 16 pruebas existentes aprobadas, sin eliminarlas ni modificarlas.
- `npm.cmd run build`: TypeScript y build de producción correctos.
- Chrome headless en perfil aislado: registro de nota y actualización del promedio; bloqueo con un clic; conservación del bloqueo con otro clic; persistencia al recargar; desbloqueo con doble clic real; calculadora sin modificar el respaldo; agregar, editar y eliminar cursos; editar ponderaciones; modificar el mínimo aprobatorio; alternar y persistir el tema; exportar JSON/CSV desde los botones; importar JSON conservando candados; restablecer notas conservando bloqueos; respeto de `prefers-reduced-motion`. Las confirmaciones se aceptaron únicamente en ese perfil de prueba.
- Revisión de capturas en 1440 px, móvil 390 px, tema nocturno y formulario modal. A 1440 px la tabla cabe completa; a 390 px se desplaza dentro de su contenedor. El ancho del documento coincidió con el viewport en ambos casos.
- Sin excepciones JavaScript observadas durante esas secuencias.

Las capturas de QA están en `.launcher/aero-desktop.png`, `aero-night.png`, `aero-mobile.png`, `aero-modal.png` y `aero-locked.png`. Esa carpeta está excluida de Git.

## Inicio y límites

Haz doble clic en **Mi Control de Notas** en el escritorio o ejecuta `npm.cmd run dev` y abre http://127.0.0.1:5173/. Si la aplicación ya está abierta, actualiza la pestaña. Se conserva el mismo origen para acceder a IndexedDB.

La inspección visual se hizo en Chrome; no se verificó manualmente en otros motores ni con lectores de pantalla. El doble clic conserva su comportamiento original: en pantallas táctiles depende de cómo el navegador produzca ese evento. El borrado de datos del navegador sigue pudiendo eliminar notas; los respaldos JSON mantienen su función anterior.

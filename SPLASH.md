# Pantalla de bienvenida Frutiger Aero

## Comportamiento

La bienvenida aparece al abrir o recargar la aplicación. Su duración mínima es 2500 ms desde que se monta; la preparación de IndexedDB y los datos ocurre en paralelo. Después de completar tanto la preparación como las consultas reactivas, comienza una salida de 350 ms y aparece el dashboard con un fade de entrada. Abrir formularios o la calculadora no vuelve a montar la bienvenida.

La barra es **indeterminada**: no muestra porcentajes inventados. Los mensajes reflejan preparación, recuperación de consultas y datos listos. Si la carga falla, se conserva la bienvenida con un mensaje y un botón funcional para reintentar. Cada reintento vuelve a esperar el mínimo, sin borrar ni restablecer notas.

Se comparte una única promesa de preparación entre los efectos de React StrictMode. Si falla, la promesa se descarta para permitir un nuevo intento. Los efectos cancelan sus temporizadores y evitan actualizar el estado después de desmontarse. La apertura explícita de Dexie permite recuperar intentos de apertura fallidos.

## Archivos

- `src/components/SplashScreen.tsx`: componente reutilizable; panel, logotipo Lucide, barra indeterminada, mensajes y error con reintento.
- `src/components/SplashScreen.css`: cristal, burbujas, reflejos, barra y transiciones. Usa el paisaje local existente. Incluye diseño móvil, tema nocturno, movimiento reducido, transparencia reducida y colores forzados.
- `src/hooks/useStartup.ts`: espera mínima, estado de preparación, finalización y reintento.
- `src/services/startup.ts`: apertura de IndexedDB, llamada a la inicialización existente y verificación de lectura; deduplicación de intentos.
- `src/hooks/useData.ts`: las consultas reactivas esperan a que termine la preparación para no competir con una apertura fallida.
- `src/App.tsx`: conecta la bienvenida con los datos reales y conserva el resto del dashboard.
- `src/startup.test.tsx`: pruebas nuevas; las pruebas existentes se conservan.
- `README.md`: referencia a esta documentación.

No se agregaron dependencias. `services/db.ts`, `utils/grades.ts`, `components/GradeCell.tsx`, `types/index.ts` y `app.test.tsx` conservan sus hashes SHA-256: esquema de IndexedDB, algoritmos, ponderaciones y eventos de candados sin cambios.

## Verificación

- 25 pruebas aprobadas: 16 existentes y 9 nuevas. Las nuevas cubren mínimo exacto, salida, inicialización lenta, espera de consultas, reintento, renderizados posteriores, cancelación de temporizadores, StrictMode, errores de lectura y progreso accesible.
- Build de producción y TypeScript correctos.
- Chrome headless en perfil temporal separado del navegador habitual: 13 comprobaciones aprobadas. Incluyen inicio, mínimo de tiempo, ocultación del dashboard durante la bienvenida, recarga con notas y candados intactos, navegación sin repetir el splash, móvil sin desbordamiento, modo nocturno, movimiento reducido y fallo real de apertura de IndexedDB con recuperación mediante el botón Reintentar.
- Duraciones observadas antes de comenzar la salida: escritorio 2525 ms, móvil 2515 ms y nocturno 2509 ms. La salida se programó a 350 ms; el navegador puede tardar algo más bajo carga.
- Sin excepciones JavaScript observadas. Se inspeccionaron capturas de escritorio y móvil; capturas disponibles en `.launcher/splash-desktop.png`, `splash-mobile.png`, `splash-night.png` y `splash-error.png`.

No se inspeccionó la base de datos del perfil habitual del usuario. La conservación se verificó con datos propios del perfil de prueba y comparando los archivos de persistencia. No se revisó manualmente en otros navegadores ni con un lector de pantalla.

## Inicio

Abre el acceso directo **Mi Control de Notas** del escritorio o ejecuta `npm.cmd run dev`. La dirección sigue siendo http://127.0.0.1:5173/. Si la aplicación ya está abierta, recarga la pestaña para ver la bienvenida.

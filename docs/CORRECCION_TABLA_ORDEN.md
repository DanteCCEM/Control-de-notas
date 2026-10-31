# Corrección de la tabla y del orden de cursos

## Causas encontradas

1. **Orden de datos.** La versión anterior no guardaba una posición. `useData` y la exportación JSON leían `courses.toArray()`, que recorre la clave primaria `id`. Los identificadores son UUID aleatorios: una base nueva en otra computadora podía mostrar los mismos seis cursos en otro orden. No era un orden aleatorio en cada lectura de una misma base: era un orden por identificadores distintos entre bases. Las filas ya tenían `key={c.id}` y las actualizaciones utilizaban el ID, por lo que no se identificó un intercambio de notas por índices de React.
2. **Distribución visual.** La tabla empleaba el algoritmo automático de columnas, con un 28% para nombres y el resto dependiente del contenido. Los nombres largos, encabezados y tamaños de casilla distintos en móvil podían cambiar la distribución. Los contenedores necesitaban límites de contracción explícitos.
3. **Zoom y anchura de página.** La prueba de 390 px a zoom equivalente 125% reprodujo desbordamiento global: `body` tenía un mínimo de 320 px, mayor que el viewport CSS disponible de 312 px.

Los breakpoints efectivos del proyecto son CSS, no clases responsive de Tailwind. Se conservan los cambios de distribución de las tarjetas y se añade una adaptación por debajo de 360 px; las columnas y casillas de la tabla mantienen sus dimensiones entre breakpoints.

## Solución

### Tabla

Se conserva la tabla HTML y el diseño Aero. Se añade `colgroup` y `table-layout: fixed` con estas dimensiones:

| Elemento                   |                                     Dimensión |
| -------------------------- | --------------------------------------------: |
| Ancho mínimo de tabla      |                                       1100 px |
| Cada columna de evaluación |                                        122 px |
| Promedio                   |                                        120 px |
| Estado                     |                                        130 px |
| Acciones                   |                                         60 px |
| Curso                      | Espacio restante, mínimo aproximado de 302 px |
| Conjunto campo y candado   |                                    99 × 39 px |

Los nombres se dividen en líneas, incluso sin espacios, dentro de su columna. La altura de las filas puede crecer para mostrar el nombre completo; las celdas de una misma fila permanecen alineadas. Los candados no se encogen ni salen de sus casillas. Las ponderaciones permanecen junto a cada evaluación.

El contenedor permite desplazamiento horizontal interno, tiene etiqueta accesible y recibe foco de teclado. No se oculta un desbordamiento de toda la página para simular una corrección. Se elimina el ancho mínimo global y se adaptan controles superiores a viewports CSS estrechos.

### Posiciones persistentes

Cada curso mantiene su ID y añade `order`, un entero no negativo. Las consultas y la exportación utilizan una comparación explícita por `order`, con desempate por ID sin depender del idioma del equipo.

- Instalaciones nuevas: los seis cursos se guardan en el orden de la lista predeterminada.
- Cursos nuevos: se añaden al final dentro de una transacción; altas concurrentes no reciben la misma posición por una carrera de lectura/escritura.
- Edición de nombres y ponderaciones: conserva la posición existente.
- Notas y candados: conservan sus funciones y se actualizan mediante el mismo ID y número de evaluación.
- JSON nuevo: conserva y valida las posiciones.
- JSON antiguo sin `order`: se acepta y se asignan posiciones según el orden de su arreglo, sin cambiar notas ni candados.
- No existía una función de arrastrar/reorganizar cursos y no se añade una interfaz nueva para ello.

### Migración segura a IndexedDB versión 2

Se conserva el nombre de la base y sus almacenes. La migración añade un índice `order` y actualiza exclusivamente el campo de posición de cada curso. Congela el orden visible que la versión 1 recorría por clave primaria; no renombra cursos ni reconstruye sus notas.

La actualización ocurre en la transacción de cambio de versión de IndexedDB. Las pruebas comprueban que IDs, nombres, ponderaciones, notas cero, pendientes, candados, configuración y campos adicionales permanecen intactos. Otra prueba provoca un error y confirma que la actualización se revierte por completo, conservando la base anterior.

**No existe información histórica de inserción en las bases antiguas.** Por eso se conserva su orden visible previo en lugar de inventar una cronología o reordenarlas por nombre. Dos bases antiguas independientes pueden conservar órdenes diferentes; un respaldo JSON permite trasladar el mismo orden entre equipos. IndexedDB no sincroniza computadoras automáticamente.

## Verificación

### Suite automatizada

`npm test`: **35 pruebas aprobadas**, incluidas las 27 existentes y ocho nuevas de posiciones, migración, rollback, altas concurrentes y compatibilidad de respaldos.

`npm run build`: TypeScript y compilación de producción correctos.

Los cálculos de notas, los eventos de los candados y los archivos de la pantalla de carga permanecen sin cambios funcionales. Se compararon los hashes de `GradeCell.tsx`, `SplashScreen.tsx`, `SplashScreen.css`, `useStartup.ts` y `services/startup.ts`; permanecen idénticos.

### Navegador y producción

`scripts/verify-table.mjs` usa Chrome/Edge instalado, Node y un perfil temporal independiente. Comprueba **el contenido de `dist/` servido por Vite preview**, no el servidor de desarrollo ni el sitio publicado en Vercel.

| Resolución de referencia | 75% | 100% | 125% | 150% |
| ------------------------ | --- | ---- | ---- | ---- |
| 1920 × 1080              | OK  | OK   | OK   | OK   |
| 1600 × 900               | OK  | OK   | OK   | OK   |
| 1366 × 768               | OK  | OK   | OK   | OK   |
| 1280 × 720               | OK  | OK   | OK   | OK   |
| 768 × 1024               | OK  | OK   | OK   | OK   |
| 390 × 844                | OK  | OK   | OK   | OK   |

**Método de zoom:** se emulan conjuntamente el viewport CSS y el device pixel ratio equivalentes a esos niveles de zoom mediante Chrome DevTools Protocol. No es una comprobación manual del menú de zoom de distintos navegadores o sistemas operativos.

En las 24 combinaciones se comprueba:

- Ausencia de desbordamiento horizontal global.
- Alineación geométrica de cada encabezado con las celdas de todas las filas.
- Campos y candados dentro de su columna y sin solaparse.
- Orden de IDs, valores de notas, bloqueos y ponderaciones correctos en cada fila.
- Nombres extensos y nombres de 120 caracteres sin espacios.
- Desplazamiento interno real de la tabla cuando es necesario.

A 100%, la tabla cabe en las cuatro resoluciones de escritorio; a 768 y 390 px utiliza desplazamiento horizontal. La prueba crea previamente una base v1 con datos propios, comprueba su migración y compara los datos antes/después de toda la matriz y de una recarga. No se accede al perfil habitual del usuario.

Sin excepciones JavaScript, solicitudes externas ni errores al cargar el SVG y los bundles de la aplicación. La petición implícita del navegador a un `favicon.ico` no declarado queda excluida de esa comprobación de recursos.

Resultados detallados y capturas en `.launcher/table-qa-results.json` y `.launcher/table-*.png` (archivos locales excluidos de Git). Se revisaron capturas de la tabla y sus controles; la automatización cubre las seis resoluciones.

Para repetir la verificación, después de compilar, inicia en otra terminal:

```sh
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort
```

Luego ejecuta:

```sh
node scripts/verify-table.mjs
```

Puedes establecer `CHROME_PATH` si el navegador está instalado en otra ruta. El script solo accede a `127.0.0.1:4173` y usa un perfil de navegador temporal.

## Archivos modificados

| Archivo                      | Cambio                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `src/types/index.ts`         | Propiedad `Course.order`.                                                                 |
| `src/utils/courseOrder.ts`   | Normalización y comparación determinista de posiciones.                                   |
| `src/services/db.ts`         | Migración v2, orden inicial, consulta ordenada, altas/ediciones y respaldos.              |
| `src/hooks/useData.ts`       | Lectura reactiva con orden explícito.                                                     |
| `src/utils/grades.ts`        | Únicamente validación y normalización del orden al importar JSON; cálculos intactos.      |
| `src/App.tsx`                | `colgroup`, accesibilidad del contenedor, ID observable por fila y guardado con posición. |
| `src/style.css`              | Dimensiones estables, nombres ajustables, overflow y viewports CSS estrechos.             |
| `src/courseOrder.test.tsx`   | Ocho pruebas adicionales.                                                                 |
| `scripts/verify-table.mjs`   | Matriz reproducible sobre el build estático.                                              |
| `README.md` y este documento | Descripción del orden persistente y de la corrección.                                     |

## Vercel, actualización y límites

No cambian los comandos de despliegue, la configuración de Vite/Vercel ni las dependencias. No se requieren variables de entorno para la aplicación; `CHROME_PATH` solo es una opción local de QA. No hay un servidor local requerido por el frontend publicado.

No se subieron cambios a GitHub ni se ejecutó un despliegue. Para publicar, queda pendiente la autorización del usuario.

La migración se ejecutará una sola vez en cada perfil cuando se cargue esta versión. Conviene exportar un JSON antes de actualizar y recargar pestañas antiguas para que utilicen el mismo código. Como ocurre con los cambios de versión de IndexedDB, un rollback a un build antiguo que solo declara la versión 1 no podrá abrir directamente una base ya migrada a versión 2; no debe intentarse resolverlo borrando datos. Ese rollback requeriría un build compatible con v2 o trasladar un respaldo a otro origen/perfil.

La compatibilidad de producción se comprobó sobre el build estático local. No se inspeccionó la aplicación desplegada ni se probaron manualmente otros motores de navegador.

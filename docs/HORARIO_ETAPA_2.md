# Mi Horario — etapa 2

## Funcionalidades

Abre **Mi Horario** en la navegación, o utiliza `#horario` en la URL. La navegación no desmonta el inicio de la aplicación ni vuelve a mostrar el splash. Pomodoro y Apuntes siguen sin implementarse.

- Semana de lunes a domingo, navegación de semanas, botón Hoy y rango visible configurable entre 00:00 y 24:00.
- Cuadrícula de escritorio con eje vertical: una hora equivale a 72 px; la posición y duración se calculan con los minutos originales. Los solapamientos se dividen en carriles laterales.
- Hasta 900 px de ancho se utiliza una vista diaria con botones de día y tarjetas legibles, sin comprimir siete columnas.
- Colores por curso, hora, ubicación, docente, modalidad y estado de clase actual. Los bloques breves priorizan hora y nombre; el título accesible y el editor permiten consultar el detalle completo. No se alargan artificialmente los bloques para acomodar texto.
- Alta en uno o varios días, edición individual y eliminación con confirmación. Todos los registros se guardan en IndexedDB.
- Ubicación, docente, enlace de videoconferencia y observaciones opcionales. Curso, día, inicio, final y modalidad obligatorios.
- Se bloquean duplicados del mismo curso/día/inicio/final, incluso si cambia el docente o la descripción. El índice compuesto único y las transacciones evitan duplicados por pulsaciones o escrituras simultáneas.
- Los solapamientos con cualquier curso generan advertencias; hay que marcar expresamente que se acepta el conflicto para guardar. Las sesiones contiguas no se consideran superpuestas.
- Tarjeta de próxima clase o clase en curso, calculada con la fecha y hora locales del dispositivo. Se consideran los siguientes días y semanas, sin inventar sesiones cuando no hay datos.
- Exportación JSON y CSV de notas e importación disponibles desde el propio módulo.

La hora final debe ser posterior a la inicial dentro del mismo día. Se admiten minutos de 00:00 a 23:59; si una clase cruza medianoche debe dividirse en dos sesiones de días consecutivos. No hay excepciones de feriados, fechas de fin de ciclo ni sincronización con calendarios externos: son sesiones semanales recurrentes.

La información temporal se recalcula cada 30 segundos y al recuperar el foco o la visibilidad. La navegación de semanas no cambia las sesiones guardadas. El rango visible es una selección temporal de la vista; no altera las horas ni crea preferencias globales nuevas.

## Arquitectura y datos

| Archivo                                     | Responsabilidad                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `types/schedule.ts`                         | Sesión, modalidad, días y borrador multidiario; referencia estable a `Course.id`.                 |
| `utils/schedule.ts`                         | Horas, validación, solapamientos, duplicados, fechas locales, próxima clase y carriles visuales.  |
| `services/schedule.ts`                      | Altas/ediciones transaccionales, eliminación de sesiones y política de eliminación de cursos.     |
| `hooks/useSchedule.ts`                      | Consulta reactiva y reloj local con limpieza de temporizadores/listeners.                         |
| `hooks/useModuleNavigation.ts`              | Navegación hash, compatible con localhost y Vercel sin rutas de servidor.                         |
| `components/SchedulePage.tsx` y `.css`      | Calendario, vista diaria, próxima clase y listado de administración.                              |
| `components/SessionEditor.tsx`              | Formulario compartido de creación/edición y confirmación de conflictos.                           |
| `modules/registry.ts` y `AppNavigation.tsx` | Activación de Mi Horario; los otros dos módulos siguen previstos.                                 |
| `services/db.ts`                            | Esquema v3 y respaldos extendidos.                                                                |
| `types/index.ts` y `utils/grades.ts`        | Contrato y validación de respaldos v1/v2; fórmulas de notas intactas.                             |
| `App.tsx`                                   | Selección de vista, acciones de respaldo reutilizadas y confirmación de eliminación con sesiones. |

### Migración incremental

IndexedDB pasa de Dexie v2 a **v3**, añadiendo exclusivamente:

```text
scheduleEntries: id, courseId, day, &[courseId+day+startMinute+endMinute]
```

No se recrean `courses` ni `settings`, no se cambian IDs y no se insertan horarios predeterminados. Se conserva la migración previa de orden v1→v2. El almacén nuevo comienza vacío.

Las sesiones tienen UUID propios y `courseId`; renombrar o reordenar un curso no mueve ni desvincula sus sesiones. Los guardados comprueban dentro de la transacción que el curso siga existiendo.

### Eliminación de cursos

La política es **eliminación conjunta confirmada**. El diálogo de eliminación informa cuántas sesiones del curso desaparecerán. Si se cancela, no se modifica nada. Si se confirma, curso y sesiones se eliminan en la misma transacción. El servicio rechaza borrar un curso con sesiones si no recibe confirmación explícita.

No se implementa reasignación masiva en esta etapa. Cada sesión sí puede editarse para elegir otro curso existente antes de eliminar el curso anterior.

## Respaldos

- La exportación completa utiliza **JSON versión 2** con `courses`, `settings` y `scheduleEntries`.
- Al restaurar v2 se sustituyen cursos, configuración y horario en una única transacción, después de validar y confirmar.
- Los JSON v1 siguen siendo compatibles. Conservan las sesiones cuyos IDs de curso estén incluidos en el respaldo.
- Si un JSON v1 deja sesiones sin curso, el diálogo indica cuántas se eliminarán y pide confirmación. Sin esa autorización el servicio rechaza la operación y revierte todo.
- Se validan campos, horas, enlaces http/https, referencias, IDs y duplicados antes de restaurar. Los conflictos aceptados previamente sí pueden restaurarse.
- El CSV conserva su formato de notas; no es un respaldo del horario.

Las preferencias existentes se recuperan desde el respaldo cuando el usuario confirma una restauración, como antes. Crear, editar o navegar por el horario no sobrescribe el tema, el mínimo aprobatorio ni las notas.

## Verificación

- **55 pruebas** automatizadas aprobadas: se añaden 17 pruebas de horarios y se actualizan las expectativas de versión/navegación de las pruebas anteriores, sin eliminar cobertura.
- Casos nuevos: horas y enlaces inválidos; intervalos contiguos/superpuestos; clase actual y próxima; cambio de día, mes y semana; recortes y carriles; alta multidiaria; edición; eliminación; persistencia al reabrir; duplicados concurrentes; integridad referencial; migración v2→v3; JSON v1/v2 y rechazo de respaldos inválidos.
- Build de producción y TypeScript correctos.
- Chrome sobre el build estático, con perfil temporal aislado: creación multidiaria, edición, bloqueo de duplicados, confirmación de conflictos, posición real de bloques (45 minutos = 54 px), recarga directa de `#horario`, exportación v2, restauración v2, importación v1 con confirmación de huérfanas y eliminación conjunta de curso/sesiones.
- Revisión responsive a 1920, 1366, 1280, 768, 390 y 312 px de ancho, con cuadrícula o vista diaria según corresponda y sin desbordamiento global.
- Edición guardada con la red desactivada después de cargar la aplicación.
- Notas y configuración comparadas antes/después de crear horarios: intactas. Las pruebas usan datos propios y no acceden al perfil habitual del usuario.

Capturas locales de revisión: `.launcher/horario-1366.png` y `.launcher/horario-390.png`. El script existente `scripts/verify-table.mjs` se actualiza para esperar la versión nativa correspondiente a Dexie v3.

## Ejecución y producción

```sh
npm install
npm run dev
npm test
npm run build
```

Se conserva el acceso directo de Windows y el funcionamiento como frontend estático en Vercel. No se añaden dependencias, APIs, variables de entorno ni configuración de despliegue. El enlace de videoconferencia solo abre un sitio externo cuando el usuario lo pulsa.

Las sesiones funcionan localmente una vez cargados los recursos. No hay service worker: no se garantiza abrir Vercel desde cero sin conexión. No se implementaron Pomodoro ni Apuntes.

Antes de publicar conviene conservar un respaldo de la versión anterior. Una base migrada a v3 requiere código que conozca esa versión; un rollback a un build v2 necesitaría una estrategia compatible y no debe resolverse borrando IndexedDB. La revisión de producción se hace sobre el build estático local, sin desplegar ni modificar la aplicación publicada.

import { db, initialize } from "./db";

// Share one attempt across StrictMode effects. A failed attempt may be retried.
let preparation: Promise<void> | undefined;
export function prepareApplication(): Promise<void> {
  preparation ??= db
    .open()
    .then(initialize)
    .then(async () => {
      await db.transaction("r", db.courses, db.settings, async () => {
        await db.courses.toArray();
        if (!(await db.settings.get("main")))
          throw new Error("No se encontró la configuración de la aplicación.");
      });
    })
    .catch((error) => {
      preparation = undefined;
      throw error;
    });
  return preparation;
}

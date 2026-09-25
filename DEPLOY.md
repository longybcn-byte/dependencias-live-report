# Despliegue rápido

## Render, recomendado

1. Sube esta carpeta a un repositorio privado de GitHub, GitLab o Bitbucket.
2. En Render, crea un **Blueprint** desde el repositorio. Detectará `render.yaml`.
3. Cuando pida secretos, completa `CLICKUP_API_TOKEN` y `REPORT_PASSWORD`. Render generará `SESSION_SECRET`.
4. Despliega. El health check será `/health` y el servicio escuchará el `PORT` que Render inyecta.
5. Abre la URL `https://<servicio>.onrender.com`.

Render construye el Dockerfile y puede redeployar automáticamente con cada push a la rama conectada. En el plan Free el servicio puede entrar en reposo, así que no lo uses para una lectura estrictamente 24/7.

## Railway

1. Sube esta carpeta a un repositorio privado.
2. En Railway, crea un proyecto y añade el repositorio como servicio.
3. Railway detectará `Dockerfile` y `railway.json`.
4. En Variables, añade:

```text
CLICKUP_API_TOKEN=pk_...
CLICKUP_LIST_ID=901222512417
REPORT_PASSWORD=una-contraseña-larga
SESSION_SECRET=una-cadena-aleatoria-de-32-caracteres-o-más
NODE_ENV=production
```

5. Genera un dominio público desde Settings > Networking > Public Networking.
6. Comprueba `https://<dominio>/health` y luego abre la raíz `/`.

## Seguridad antes de compartir

- No subas `.env`, tokens ni contraseñas al repositorio.
- Rota el token si alguna vez se expone.
- Mantén HTTPS activado.
- Si el informe se incrusta en ClickUp mediante iframe, revisa las políticas de framing del proveedor. La aplicación envía `frame-ancestors 'none'` por defecto para impedir clickjacking; para incrustarlo tendrás que ajustar CSP con una lista explícita de orígenes permitidos.
- El informe solo lee datos. No crea, modifica ni borra tareas.

## Referencias oficiales

- Render: https://render.com/docs/web-services
- Render Blueprints: https://render.com/docs/blueprint-spec
- Railway Dockerfiles: https://docs.railway.com/builds/dockerfiles
- Railway config as code: https://docs.railway.com/config-as-code/reference


## Corrección del error `npm ci`

El proyecto no incluía `package-lock.json`, pero el Dockerfile intentaba ejecutar `npm ci`, que exige ese archivo. El Dockerfile corregido usa `npm install --omit=dev --no-audit --no-fund`, así que Render puede construirlo sin lockfile.


## Si la pantalla de contraseña no responde

La versión anterior tenía el JavaScript dentro de `index.html`, pero la política CSP de Helmet bloqueaba scripts inline. Esta versión mueve el código a `public/app.js`, que sí está permitido por CSP.

## Árbol completo de dependencias

La versión actual ya no limita el mapa a las tres primeras relaciones ni a la primera tarea bloqueada. Construye niveles desde todas las relaciones que devuelve ClickUp, dibuja todas las tareas y flechas disponibles y mantiene cada nodo enlazado a su tarea.

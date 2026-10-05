# 🚀 Guía para subir el sistema a Vercel + Turso
## (Gratis — funciona 24/7 aunque tu PC esté apagada)

---

## PASO 1 — Crear cuenta en GitHub (si no tienes)
1. Ve a https://github.com y crea una cuenta gratis
2. Crea un repositorio nuevo llamado `nfc-redirect`
3. Sube todos los archivos de esta carpeta al repositorio

**Desde esta carpeta, ejecuta:**
```
git init
git add .
git commit -m "primer commit"
git remote add origin https://github.com/TU_USUARIO/nfc-redirect.git
git push -u origin main
```

---

## PASO 2 — Crear base de datos en Turso (gratis)
1. Ve a https://turso.tech y crea una cuenta (gratis, hasta 500 bases de datos)
2. Instala la CLI de Turso: `npm install -g @turso/cli`
3. Inicia sesión: `turso auth login`
4. Crea la base de datos: `turso db create nfc-tarija`
5. Obtén la URL: `turso db show nfc-tarija`
   - Copia el valor de "URL" → se ve como `libsql://nfc-tarija-TUUSUARIO.turso.io`
6. Crea un token: `turso db tokens create nfc-tarija`
   - Copia el token generado

**Guarda esos dos valores para el siguiente paso.**

---

## PASO 3 — Subir a Vercel (gratis)
1. Ve a https://vercel.com y crea cuenta (puedes entrar con GitHub)
2. Haz clic en "Add New Project"
3. Importa tu repositorio `nfc-redirect` de GitHub
4. Antes de hacer Deploy, ve a **Environment Variables** y agrega:

   | Variable              | Valor                              |
   |-----------------------|------------------------------------|
   | TURSO_DATABASE_URL    | libsql://nfc-tarija-...turso.io    |
   | TURSO_AUTH_TOKEN      | el-token-que-copiaste              |
   | ADMIN_PASSWORD        | tu-contraseña-segura               |
   | SESSION_SECRET        | cualquier-texto-largo-random       |

5. Haz clic en **Deploy**
6. Vercel te dará una URL como: `nfc-redirect-abc123.vercel.app`

---

## PASO 4 — Probar que funciona
1. Abre `https://TU-PROYECTO.vercel.app/admin`
2. Inicia sesión con tu contraseña
3. Crea un lote de tarjetas (ej: TAR001 a TAR050)
4. Ve a "Imprimir QR", pon tu URL de Vercel, genera y descarga

---

## PASO 5 — Imprimir los QR (cómo hacerlo físico)

### Opción A — Imprimir en hoja y recortar
1. Ve al panel → pestaña "Imprimir QR"
2. Pon tu URL de Vercel en el campo
3. Genera los QR y haz clic en "Imprimir"
4. Se abre el navegador de impresión
5. Imprime en papel adhesivo (stickers) o fotográfico
6. Recorta y pega en la tarjeta NFC

### Opción B — Descargar QR individual
1. En la lista de tarjetas, haz clic en "QR"
2. Pon tu URL de Vercel
3. Descarga el PNG de 600x600px
4. Manda a imprimir en una imprenta a 85.6x54mm

---

## EJEMPLO del flujo real de tu negocio

```
1. Compras 100 tarjetas NFC PVC 213
2. Creas 100 entradas en el panel: TAR001...TAR100
3. Imprimes hoja con los 100 QR → todos apuntan a tu Vercel
4. Pegas el QR en cada tarjeta (atrás o al frente)
5. Un restaurante te compra una tarjeta → editas TAR045 en el panel
   → pones: "Restaurante El Fogón" + la URL de sus reseñas de Google
6. El cliente escanea la tarjeta → va directo a reseñas del restaurante
7. Si el restaurante cierra → cambias TAR045 a otro cliente en segundos
```

---

## Obtener el enlace de Google Reviews de un negocio

1. Busca el negocio en Google Maps
2. Haz clic en el local
3. En el panel lateral, busca "Reseñas" → haz clic en "Escribir una reseña"
4. Se abre una ventana → copia la URL del navegador
5. Esa URL es la que pegas en el campo "URL de Google Reviews"

**También puedes usar Google Business Profile:**
- Entra al perfil del negocio → "Obtener más reseñas" → copia el enlace corto

---

## Contraseña del panel
La contraseña se define en Vercel como variable de entorno `ADMIN_PASSWORD`.
Para cambiarla: Vercel → tu proyecto → Settings → Environment Variables → editar.

---

*Sistema desarrollado para emprendimiento NFC Google Reviews — Tarija, Bolivia*

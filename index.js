// index.js
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors'; // Import CORS
import { serveStatic } from '@hono/node-server/serve-static';
// index.js (lanjutan)
import { db } from './db/index.js';
import { users, quranNotes } from './db/schema.js'; // PERUBAHAN: quranNotes
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setCookie, getCookie } from 'hono/cookie';


const app = new Hono();

// 🔑 MIDDLEWARE: CORS
// Izinkan akses dari semua origin (*) untuk pengembangan,
// atau ganti dengan domain spesifik Anda saat production.
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'https://domain-client-anda.com'], // Ganti dengan domain client Anda
    credentials: true, // PENTING untuk cookies (Auth)
  })
);

// Server Statis (UI)
app.use('/*', serveStatic({ root: './public' }));

// Endpoint Dasar
app.get('/', (c) => {
  return c.redirect('/index.html');
});

// ... (kode otentikasi dan catatan akan masuk di bawah)

// 1. API Registrasi
app.post('/api/register', async (c) => {
  try {
    const { username, password } = await c.req.json();
    // Cek jika username sudah ada
    const existingUser = await db.query.users.findFirst({ where: (users, { eq }) => eq(users.username, username) });
    if (existingUser) return c.json({ success: false, message: 'Username sudah terdaftar' }, 409); // Conflict

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert(users)
      .values({ username, password: hashedPassword })
      .returning({ id: users.id, username: users.username });

    return c.json({ success: true, data: newUser[0] }, 201);
  } catch (error) {
    return c.json({ success: false, message: 'Registrasi gagal' }, 400);
  }
});

// ... (Lanjutkan di bawah)
// index.js (lanjutan)
// 2. API Login
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await db.query.users.findFirst({ where: (users, { eq }) => eq(users.username, username) });

  if (!user) return c.json({ success: false, message: 'Username atau password salah' }, 401);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return c.json({ success: false, message: 'Username atau password salah' }, 401);

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Atur cookie dengan httpOnly=true agar aman
  setCookie(c, 'token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 3600,
    secure: process.env.NODE_ENV === 'production' // Gunakan secure di Vercel/production
  });

  return c.json({ success: true, message: 'Login berhasil' });
});
// ... (Lanjutkan di bawah)

// index.js (lanjutan)
// 3. API Me (mendapatkan info user dari token)
app.get('/api/me', (c) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    // Verifikasi token untuk mendapatkan payload (id, username)
    const user = jwt.verify(token, process.env.JWT_SECRET);

    return c.json({ success: true, data: user });
  } catch (error) {
    console.error("error", error);
    return c.json({ success: false, message: 'Invalid token' }, 401);
  }
});

// ... (Lanjutkan di bawah)
// index.js (lanjutan)
// 4. API Logout
app.post('/api/logout', (c) => {
  // Hapus cookie dengan mengatur maxAge menjadi -1
  setCookie(c, 'token', '', { maxAge: -1 });
  return c.json({ success: true, message: 'Logout berhasil' });
});

// ... (Lanjutkan di bawah)

// index.js (lanjutan)
// 5. API Menambah Catatan Quran
app.post('/api/notes', async (c) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const { surah_ayah, note } = await c.req.json(); // PERUBAHAN: Ambil surah_ayah & note

    if (!surah_ayah || !note) {
      return c.json({ success: false, message: 'Surah/Ayat dan catatan tidak boleh kosong' }, 400);
    }

    const newNote = await db.insert(quranNotes) // PERUBAHAN: quranNotes
      .values({ surah_ayah, note, userId: user.id })
      .returning();

    return c.json({ success: true, data: newNote[0] }, 201);
  } catch (error) {
    console.error("error", error);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
});

// ... (Lanjutkan di bawah)

// index.js (lanjutan)
// 6. API Melihat Semua Catatan Quran milik User
app.get('/api/notes', async (c) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const userNotes = await db.query.quranNotes.findMany({ // PERUBAHAN: quranNotes
      where: (quranNotes, { eq }) => eq(quranNotes.userId, user.id) // PERUBAHAN: quranNotes
    });
    return c.json({ success: true, data: userNotes });
  } catch (error) {
    console.error("error", error);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
});

// ... (kode serve di bagian akhir)



// Jalankan Server (untuk lokal)
if (process.env.VERCEL) {
  console.log('Running on Vercel');
  globalThis.app = app;
} else {
  const port = 3000;
  console.log(`🚀 Server is running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}
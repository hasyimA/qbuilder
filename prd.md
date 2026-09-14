# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## Web-Based Quiz Builder for Moodle

**Versi:** 1.0
**Status:** Draft untuk Development
**Target:** Web Application
**Platform utama:** Desktop/Web Browser
**Target pengguna:** Guru, pengajar, pembuat soal, administrator sekolah
**Primary output:** Moodle-compatible quiz/question package

---

# 1. Ringkasan Produk

Aplikasi ini adalah **web-based quiz authoring platform** yang dirancang untuk membuat, mengelola, menyimpan, mengedit, membagikan, dan mengekspor soal ujian/kuis ke Moodle.

Aplikasi terinspirasi dari workflow aplikasi quiz builder lama seperti ExamView, tetapi dirancang ulang menggunakan pendekatan modern:

* Web-based
* Tidak membutuhkan instalasi desktop
* Rich Text Editor modern
* Copy-paste langsung dari Microsoft Word
* Dukungan gambar
* Dukungan rumus matematika
* Bulk paste pilihan jawaban
* Question Bank / Quiz Library
* Modal-based question editor
* Autosave draft
* Drag-and-drop soal
* Preview
* Moodle XML export
* Arsitektur siap dikembangkan menjadi integrasi langsung dengan Moodle

Prinsip utama produk:

> **Guru harus dapat membuat soal lebih cepat daripada membuat soal secara manual di Word lalu memasukkannya satu per satu ke Moodle.**

---

# 2. Product Vision

Membangun platform authoring soal yang menjadi jembatan antara:

```text
Guru
  ↓
Question Authoring
  ↓
Question Bank
  ↓
Quiz
  ↓
Moodle
```

Aplikasi bukan sekadar form input soal.

Aplikasi harus terasa seperti **professional authoring tool**.

---

# 3. Problem Statement

Workflow pembuatan soal saat ini memiliki beberapa masalah:

1. Aplikasi quiz builder lama sudah tidak modern.
2. Guru terbiasa membuat soal menggunakan Microsoft Word.
3. Copy-paste dari Word ke Moodle sering membutuhkan banyak pekerjaan manual.
4. Gambar harus dipindahkan/upload secara terpisah.
5. Rumus matematika sulit dipindahkan dengan benar.
6. Pilihan jawaban harus sering dimasukkan satu per satu.
7. Editor Moodle tidak selalu nyaman untuk authoring soal dalam jumlah banyak.
8. Pembuatan banyak soal membutuhkan terlalu banyak perpindahan halaman.
9. Proses CRUD tradisional menyebabkan reload halaman.
10. Tidak semua soal perlu langsung dipublikasikan ke Moodle.
11. Guru membutuhkan library soal yang dapat digunakan kembali.

---

# 4. Product Goals

## 4.1 Primary Goals

Aplikasi harus:

1. Memungkinkan user membuat quiz dengan cepat.
2. Memungkinkan user membuat dan mengedit soal tanpa meninggalkan halaman Quiz Builder.
3. Mendukung copy-paste soal dari Microsoft Word.
4. Mendukung gambar dalam pertanyaan dan pilihan jawaban.
5. Mendukung equation/rich mathematical content.
6. Memungkinkan paste pilihan jawaban secara massal.
7. Memiliki Question Library/Quiz Store.
8. Memungkinkan duplicate dan reorder soal.
9. Menyediakan preview soal.
10. Menghasilkan Moodle XML yang valid.
11. Memiliki arsitektur yang siap untuk integrasi langsung dengan Moodle.
12. Meminimalkan page reload dan loading.

---

# 5. Non-Goals MVP

Fitur berikut tidak menjadi kewajiban pada MVP pertama:

* AI question generation
* Analisis statistik hasil ujian
* Collaborative real-time editing
* Direct Moodle publishing
* Mobile native application
* Advanced proctoring
* Payment/marketplace
* Subscription system
* Gamification
* Full LMS functionality

Fitur tersebut harus tetap dipertimbangkan dalam arsitektur agar tidak menghambat pengembangan berikutnya.

---

# 6. Target User

## 6.1 Teacher / Author

Guru yang membuat soal.

Kebutuhan:

* membuat quiz
* membuat soal
* paste dari Word
* upload gambar
* membuat rumus
* mengedit soal
* duplicate soal
* mengurutkan soal
* menyimpan soal
* export Moodle XML

## 6.2 Reviewer

Pengguna yang dapat melakukan review soal.

Fitur ini dapat ditambahkan setelah MVP.

## 6.3 Administrator

Mengelola:

* user
* library
* kategori
* shared quiz
* konfigurasi sistem

---

# 7. Core User Journey

Workflow utama:

```text
LOGIN
  ↓
DASHBOARD
  ↓
BUAT QUIZ
  ↓
QUIZ BUILDER
  ↓
TAMBAH SOAL
  ↓
PILIH JENIS SOAL
  ↓
QUESTION EDITOR
  ↓
INPUT / PASTE / EDIT
  ↓
SAVE
  ↓
QUESTION LIST
  ↓
PREVIEW
  ↓
EXPORT MOODLE XML
```

Untuk pembuatan banyak soal:

```text
Quiz Builder
    ↓
+ Tambah Soal
    ↓
Question Editor
    ↓
Save & Add Another
    ↓
Question Editor kosong
    ↓
Soal berikutnya
```

Tidak boleh terjadi full page reload pada workflow tersebut.

---

# 8. Information Architecture

Struktur aplikasi:

```text
Application
│
├── Authentication
│   ├── Login
│   ├── Register
│   └── Forgot Password
│
├── Dashboard
│
├── My Quizzes
│   ├── Quiz List
│   ├── Create Quiz
│   └── Edit Quiz
│
├── Quiz Builder
│   ├── Quiz Information
│   ├── Question List
│   ├── Question Editor
│   ├── Preview
│   └── Export
│
├── Quiz Library / Store
│   ├── Browse
│   ├── Search
│   ├── Filter
│   ├── Preview
│   └── Clone
│
├── Question Bank
│
└── Account
```

---

# 9. Dashboard

Dashboard harus sederhana.

Komponen utama:

```text
Welcome

[ + Buat Quiz ]

Recent Quizzes

My Quizzes

Quiz Library

Drafts
```

Contoh informasi quiz:

```text
UTS Network System XI
40 Questions
Draft
Last updated: 10 Sep 2026

[Open]
```

Dashboard tidak perlu penuh dengan statistik kompleks pada MVP.

---

# 10. Quiz Entity

Sebuah Quiz minimal memiliki:

* ID
* Owner
* Title
* Description
* Subject
* Grade/Level
* Category
* Tags
* Status
* Visibility
* Created At
* Updated At

Status:

```text
Draft
Published
Archived
```

Visibility:

```text
Private
School
Public
```

Untuk MVP, Private dan Public/Shared dapat diprioritaskan.

---

# 11. Quiz Builder

Quiz Builder adalah **halaman utama authoring**.

Halaman ini harus persistent.

User tidak berpindah ke halaman baru setiap kali menambah/edit soal.

Struktur:

```text
┌──────────────────────────────────────────────┐
│ Quiz Title                 Preview   Export  │
├──────────────┬───────────────────────────────┤
│ Question Nav │ Question List                  │
│              │                               │
│ 1            │ Question 1                    │
│ 2            │ Question 2                    │
│ 3            │ Question 3                    │
│ 4            │ ...                           │
│              │                               │
│ + Add        │                               │
└──────────────┴───────────────────────────────┘
```

---

# 12. Question Navigation

Sidebar question navigation menampilkan:

```text
1
2
3
4
5
...
```

User dapat:

* klik nomor soal
* melihat status soal
* drag-and-drop reorder
* membuka editor
* duplicate
* delete

Status visual:

```text
Draft
Complete
Needs Attention
```

Contoh:

```text
1 ✓
2 ✓
3 !
4 ✓
```

---

# 13. Add Question UX

Ketika user klik:

**+ Tambah Soal**

jangan pindah halaman.

Buka **large modal / full-height sheet**.

Modal harus menggunakan sebagian besar viewport.

Tujuannya agar question editor memiliki ruang yang cukup.

---

# 14. Question Type Selector

Saat membuat soal baru, tampilkan pilihan:

```text
Pilihan Ganda
Pilihan Ganda Kompleks
Benar / Salah
Menjodohkan
Isian Singkat
Numerik
Essay
Cloze
```

MVP minimal:

```text
Multiple Choice
True / False
Short Answer
Essay
```

Jenis lainnya dapat ditambahkan bertahap.

---

# 15. Question Editor

Question Editor harus reusable untuk:

* Create
* Edit
* Duplicate

Editor menggunakan komponen yang sama.

Struktur umum:

```text
Question Type

Question Content

Answer Options

Scoring

Feedback

Metadata

Actions
```

---

# 16. Question Content Editor

Editor pertanyaan menggunakan Rich Text Editor.

Minimal mendukung:

* Bold
* Italic
* Underline
* Strikethrough
* Ordered List
* Unordered List
* Heading
* Link
* Image
* Table
* Equation
* Clear Formatting

Toolbar tidak boleh terlalu kompleks.

Prioritas:

> cepat digunakan oleh guru.

---

# 17. Word Copy-Paste

Ini adalah salah satu **core differentiator** aplikasi.

User harus dapat:

```text
Microsoft Word
     ↓
Ctrl+C
     ↓
Quiz Builder
     ↓
Ctrl+V
```

Tanpa harus melakukan formatting ulang secara manual.

Aplikasi harus memprioritaskan:

```text
text/html
```

dari Clipboard API.

Fallback:

```text
text/plain
```

---

# 18. Word Paste Processing Pipeline

Pipeline:

```text
Clipboard
    ↓
HTML Extraction
    ↓
Sanitization
    ↓
Normalization
    ↓
Image Extraction
    ↓
Equation Detection
    ↓
Document Model
    ↓
Editor
```

HTML dari Word tidak boleh dimasukkan mentah ke database.

Harus dilakukan sanitization.

---

# 19. HTML Sanitization

Aplikasi harus menghapus:

* script
* iframe berbahaya
* event handlers
* unsafe URLs
* Word-specific garbage markup
* style yang tidak diperlukan
* unsupported tags

Tetapi mempertahankan:

* paragraph
* text formatting
* lists
* tables
* images
* equations jika dapat diproses
* links yang aman

---

# 20. Image Handling

Gambar harus dapat berasal dari:

1. Upload manual
2. Paste dari clipboard
3. Paste dari Microsoft Word

Workflow:

```text
Paste Image
    ↓
Blob
    ↓
Upload API
    ↓
Storage
    ↓
Media ID
    ↓
Document Model
```

Database tidak menyimpan gambar dalam bentuk base64.

---

# 21. Media Storage

Media harus mempunyai entity sendiri.

Contoh:

```text
Media
├── id
├── owner_id
├── filename
├── mime_type
├── size
├── storage_path
├── width
├── height
├── alt_text
├── created_at
```

Storage dapat menggunakan:

* local storage pada development
* S3-compatible storage pada production
* MinIO jika diperlukan self-hosted

---

# 22. Equation Support

Aplikasi harus mendukung equation.

Representasi internal tidak boleh bergantung pada HTML hasil Word.

Recommended internal representation:

```json
{
  "type": "equation",
  "format": "latex",
  "value": "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
}
```

Renderer:

```text
Internal Equation
       ↓
Math Renderer
       ↓
Browser
```

Untuk input manual, user dapat menggunakan equation editor.

Untuk Word paste, sistem harus berusaha mengonversi equation Word/OMML ke representasi internal yang didukung.

Jika konversi otomatis gagal:

```text
Equation could not be converted automatically.
[Keep as Image]
```

Sistem tidak boleh diam-diam merusak rumus.

---

# 23. Answer Options

Untuk Multiple Choice:

```text
A [Editor]
B [Editor]
C [Editor]
D [Editor]
E [Editor]
```

Setiap option memiliki:

* content
* correct/incorrect
* score/fraction
* feedback
* order

---

# 24. Image pada Answer Options

Pilihan jawaban harus menggunakan editor yang sama dengan question content.

Contoh:

```text
A. [gambar router]
B. [gambar switch]
C. [gambar hub]
D. [gambar access point]
```

Gambar dapat:

* upload
* paste
* drag/drop jika didukung browser

---

# 25. Bulk Paste Answer Options

User dapat paste:

```text
A. Router
B. Switch
C. Hub
D. Access Point
E. Repeater
```

Sistem melakukan parsing otomatis.

Format yang harus didukung:

```text
A. Answer
B. Answer
C. Answer
```

```text
A) Answer
B) Answer
C) Answer
```

```text
a. Answer
b. Answer
c. Answer
```

dan fallback:

```text
Answer 1
Answer 2
Answer 3
```

Jika parser tidak yakin, jangan langsung memasukkan data.

Tampilkan preview:

```text
Detected 5 options

A → Router
B → Switch
C → Hub
D → Access Point
E → Repeater

[Import]
[Cancel]
```

---

# 26. Smart Paste Question

Sistem harus memiliki fondasi untuk mendukung bulk question parsing.

Contoh input:

```text
1. Perangkat yang digunakan untuk...
A. Router
B. Switch
C. Hub
D. Modem

2. Protokol yang digunakan...
A. HTTP
B. FTP
C. SMTP
D. DNS
```

Sistem dapat mendeteksi:

```text
Question 1
Question 2
```

dan option masing-masing.

MVP dapat membuat fitur ini sebagai tahap setelah single-question Word paste stabil.

---

# 27. Question Scoring

Question minimal memiliki:

```text
Default Mark
```

Untuk Multiple Choice:

```text
Correct answer
Fraction
```

Contoh:

```text
A → 100%
B → 0%
C → 0%
D → 0%
```

Untuk Multiple Choice Complex:

```text
A → 50%
B → 50%
C → 0%
D → -50%
```

Question engine harus menggunakan model fraction agar fleksibel untuk Moodle.

---

# 28. Feedback

Question dapat mempunyai:

```text
General Feedback
Correct Feedback
Incorrect Feedback
Partially Correct Feedback
```

MVP dapat memprioritaskan General Feedback.

---

# 29. Question Metadata

Question dapat mempunyai:

```text
Category
Tags
Difficulty
Topic
Learning Objective
Cognitive Level
```

MVP minimal:

```text
Tags
Category
```

Field lain dapat digunakan untuk pengembangan berikutnya.

---

# 30. Save Behavior

Question Editor harus memiliki:

```text
Cancel
Save
Save & Add Another
```

### Save

```text
Save
 ↓
API
 ↓
Question List updated
 ↓
Modal closes
```

### Save & Add Another

```text
Save
 ↓
Question persisted
 ↓
Modal tetap terbuka
 ↓
Editor reset
 ↓
Question type tetap sama
```

Ini sangat penting untuk pembuatan 20–50 soal.

---

# 31. Autosave

Question editor harus mendukung draft autosave.

Strategi:

```text
User typing
    ↓
Debounce
    ↓
Draft save
```

Interval tidak boleh melakukan request pada setiap keystroke.

Contoh:

```text
User berhenti mengetik
       ↓
1–2 detik
       ↓
Autosave draft
```

UI:

```text
Saving...
Saved ✓
```

Jika gagal:

```text
Unable to save draft
[Retry]
```

---

# 32. Local Recovery

Untuk mencegah kehilangan pekerjaan:

```text
Editor State
     ↓
Local Storage / IndexedDB
```

dapat digunakan sebagai recovery mechanism.

Jika browser refresh:

```text
Unsaved draft found.

[Restore]
[Discard]
```

Jangan mengandalkan local storage sebagai permanent source of truth.

---

# 33. Duplicate Question

Setiap question dapat:

```text
Duplicate
```

Hasil:

```text
Question 5
Question 6 (copy)
```

Media dan content harus di-reference dengan aman.

Tidak boleh terjadi media corruption.

---

# 34. Delete Question

Delete harus menggunakan confirmation:

```text
Delete question?

This action will remove the question from this quiz.

[Cancel] [Delete]
```

Jika versioning telah tersedia, hard delete dapat diganti soft delete.

---

# 35. Drag and Drop

Question harus dapat diurutkan menggunakan drag-and-drop.

Contoh:

```text
1
2
3
4
5
```

User drag:

```text
5 → 2
```

menjadi:

```text
1
5
2
3
4
```

Sort order disimpan ke server.

---

# 36. Preview

Preview harus tersedia sebelum export.

Mode:

```text
Preview Quiz
```

Preview harus menyerupai rendering Moodle sedekat mungkin.

Contoh:

```text
Question 1

Perhatikan topologi berikut.

[Image]

○ Router
○ Switch
○ Hub
○ Access Point
```

Preview harus menampilkan:

* formatting
* image
* equation
* table
* answer options

---

# 37. Moodle XML Export

MVP utama export:

```text
Quiz
 ↓
Question Model
 ↓
Moodle XML Generator
 ↓
.xml
```

User:

```text
[Export Moodle XML]
```

mendapat file:

```text
quiz-name.xml
```

---

# 38. Moodle Export Architecture

Jangan menyimpan struktur database mengikuti Moodle XML.

Gunakan:

```text
Internal Question Model
        ↓
Moodle XML Exporter
```

Dengan demikian future exporter dapat dibuat:

```text
Moodle XML
GIFT
QTI
Word
PDF
```

tanpa mengubah model database.

---

# 39. Moodle XML Requirements

Exporter harus mendukung minimal:

* category
* question name
* question text
* images
* answer options
* fractions
* feedback
* default grade
* supported question types

Jika media digunakan, exporter harus menangani kebutuhan Moodle terhadap embedded files/resource references dengan benar.

Exporter harus memiliki automated tests untuk memastikan XML valid.

---

# 40. Future Moodle Integration

Setelah XML export stabil, aplikasi dapat mendukung:

```text
Quiz Builder
      ↓
Moodle Connector
      ↓
Moodle
```

User memilih:

```text
Moodle Site
Course
Category
Quiz
```

kemudian:

```text
[Publish to Moodle]
```

Fitur ini bukan MVP.

---

# 41. Quiz Library / Store

Quiz Library adalah tempat quiz yang dapat digunakan kembali.

Kategori:

```text
My Quiz
Shared Quiz
School Library
Public Library
```

Fitur:

* search
* filter
* preview
* clone
* copy

---

# 42. Clone Quiz

User tidak boleh mengedit quiz milik user lain secara langsung.

Gunakan:

```text
Clone
```

Contoh:

```text
UTS TJKT XI
Author: A

[Clone]

↓
UTS TJKT XI - Copy
Owner: Current User
```

---

# 43. Search dan Filter

Quiz Library minimal mendukung:

```text
Search
Subject
Grade
Category
Author
Tag
```

Search harus server-side jika data sudah besar.

---

# 44. Question Bank

Question Bank merupakan pengembangan penting.

Konsep:

```text
Question
   ↓
Question Bank
   ↓
Quiz
```

Satu question dapat digunakan pada beberapa quiz.

Tetapi saat question dimasukkan ke quiz, sistem harus menentukan apakah:

### Reference

Quiz menggunakan question yang sama.

atau:

### Copy

Quiz mendapatkan snapshot/copy question.

Untuk MVP, **copy/snapshot** lebih aman.

---

# 45. Versioning

Arsitektur harus dipersiapkan untuk versioning.

Contoh:

```text
UTS TJKT

v1
v2
v3
```

Tujuannya agar revisi soal tidak merusak quiz lama.

Versioning dapat diimplementasikan setelah MVP core stabil.

---

# 46. Data Model

Model utama:

```text
User
Quiz
Question
QuestionOption
Media
QuestionCategory
Tag
QuizQuestion
```

Future:

```text
QuestionVersion
QuizVersion
MoodleConnection
Export
Review
```

---

# 47. Recommended Database Relationship

```text
User
 │
 ├── Quiz
 │     │
 │     └── QuizQuestion
 │             │
 │             └── Question
 │                    │
 │                    ├── QuestionOption
 │                    │
 │                    ├── Media
 │                    │
 │                    └── Tag
 │
 └── Media
```

QuizQuestion harus memiliki:

```text
quiz_id
question_id
sort_order
```

Hal ini memungkinkan satu question digunakan oleh banyak quiz jika arsitektur tersebut diaktifkan.

---

# 48. Question Content Model

Question content jangan disimpan sebagai arbitrary HTML saja.

Gunakan structured document model.

Contoh konseptual:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Perhatikan gambar berikut."
        }
      ]
    },
    {
      "type": "image",
      "attrs": {
        "mediaId": "123"
      }
    }
  ]
}
```

Equation:

```json
{
  "type": "equation",
  "attrs": {
    "format": "latex",
    "value": "\\frac{1}{2}"
  }
}
```

Ini membuat content dapat dirender ke berbagai target.

---

# 49. Recommended Frontend Architecture

Recommended:

```text
React
Next.js
Tiptap
TypeScript
Tailwind CSS
```

Alasan:

* rich interaction
* modal state
* drag/drop
* autosave
* editor state
* clipboard processing
* optimistic UI
* scalable component architecture

Frontend harus menggunakan TypeScript.

---

# 50. Recommended Backend Architecture

Recommended:

```text
Laravel
PHP
PostgreSQL
Redis
```

Backend bertanggung jawab terhadap:

* authentication
* authorization
* quiz CRUD
* question CRUD
* media upload
* media authorization
* export
* validation
* library
* future Moodle integration

---

# 51. API Architecture

Gunakan REST API.

Contoh:

```text
POST   /api/quizzes
GET    /api/quizzes
GET    /api/quizzes/{id}
PATCH  /api/quizzes/{id}
DELETE /api/quizzes/{id}
```

Question:

```text
POST   /api/quizzes/{quiz}/questions
GET    /api/quizzes/{quiz}/questions
PATCH  /api/questions/{question}
DELETE /api/questions/{question}
POST   /api/questions/{question}/duplicate
```

Reordering:

```text
PATCH /api/quizzes/{quiz}/questions/order
```

Media:

```text
POST /api/media
DELETE /api/media/{media}
```

Export:

```text
POST /api/quizzes/{quiz}/export/moodle
```

---

# 52. API Response Convention

Response harus konsisten.

Success:

```json
{
  "data": {},
  "message": "Question saved successfully."
}
```

Validation:

```json
{
  "message": "Validation failed.",
  "errors": {}
}
```

Error harus memiliki HTTP status yang tepat.

---

# 53. Authentication

MVP:

* email
* password
* session/token authentication
* logout
* password reset

Authorization wajib diterapkan.

User hanya boleh mengubah resource yang menjadi haknya kecuali mempunyai permission khusus.

---

# 54. Security

Security merupakan requirement wajib.

Minimal:

* CSRF protection
* XSS prevention
* HTML sanitization
* authorization policy
* upload validation
* MIME validation
* file size limit
* safe filename handling
* rate limiting
* password hashing
* secure session management
* signed/private media URL jika diperlukan

Jangan mempercayai MIME type dari client.

---

# 55. File Upload Security

Allowed image types minimal:

```text
image/png
image/jpeg
image/webp
```

Ukuran maksimal harus configurable.

Server harus melakukan:

```text
Extension validation
MIME validation
File signature validation
Image decoding validation
```

Jangan menyimpan executable content pada public upload directory.

---

# 56. Performance Requirements

Aplikasi harus terasa responsive.

Target:

* navigasi internal tanpa full page reload
* question editor terbuka secara instan setelah data tersedia
* autosave tidak mengganggu typing
* question list tidak reload seluruh quiz setelah setiap perubahan
* image upload menggunakan progress indicator
* large quiz menggunakan pagination/virtualization bila diperlukan

---

# 57. Optimistic UI

Untuk operasi sederhana:

```text
Duplicate
Reorder
Mark Correct Answer
```

frontend dapat menggunakan optimistic update jika aman.

Contoh:

```text
User drag question
 ↓
UI langsung berubah
 ↓
API request
 ↓
Success
```

Jika gagal:

```text
Revert
+
Error notification
```

---

# 58. Loading Strategy

Jangan menggunakan global loading spinner untuk setiap operasi.

Gunakan:

```text
Skeleton
Inline loading
Button loading
Progress indicator
```

Contoh:

```text
[Saving...]
```

bukan:

```text
Loading seluruh halaman...
```

---

# 59. Modal Behavior

Question Editor:

* large modal
* responsive
* sticky header/footer jika diperlukan
* scroll area di tengah
* close confirmation jika ada unsaved changes

Contoh:

```text
┌───────────────────────────────┐
│ Edit Question            X    │
├───────────────────────────────┤
│                               │
│      Scrollable Editor        │
│                               │
├───────────────────────────────┤
│ Cancel     Save & Add   Save  │
└───────────────────────────────┘
```

---

# 60. Keyboard UX

Minimal:

```text
Ctrl/Cmd + S
```

Save.

```text
Ctrl/Cmd + Enter
```

Save & Add Another.

```text
Esc
```

Close modal jika tidak ada perubahan yang belum disimpan.

Editor harus tetap menghormati shortcut bawaan browser/editor jika terjadi konflik.

---

# 61. Accessibility

Minimal:

* keyboard navigable
* visible focus state
* semantic labels
* ARIA untuk modal
* screen-reader friendly button labels
* sufficient contrast
* keyboard access untuk action utama

---

# 62. Responsive Design

Primary target:

```text
Desktop
Laptop
Tablet
```

Mobile bukan primary authoring device.

Namun aplikasi harus tetap dapat dibuka di mobile untuk:

* preview
* browsing library
* editing ringan

Question authoring kompleks boleh dioptimalkan terutama untuk desktop.

---

# 63. Error Handling

Error harus actionable.

Buruk:

```text
Error 500
```

Lebih baik:

```text
Question could not be saved.

Your latest changes are still available locally.

[Retry]
```

Untuk image:

```text
Image upload failed.

Please check the file size and format.

[Retry]
```

---

# 64. Unsaved Changes

Jika user mencoba menutup editor:

```text
You have unsaved changes.

[Keep Editing]
[Discard Changes]
```

Jika autosave aktif dan draft sudah aman:

```text
Draft saved.

Close editor?
```

---

# 65. Empty States

My Quiz kosong:

```text
You haven't created a quiz yet.

Create your first quiz to get started.

[+ Create Quiz]
```

Question kosong:

```text
No questions yet.

Start by adding your first question.

[+ Add Question]
```

---

# 66. Toast Notification

Gunakan toast untuk operasi ringan:

```text
Question saved
Quiz duplicated
Question deleted
Export generated
```

Jangan menggunakan modal untuk notifikasi sederhana.

---

# 67. UI Design Principles

UI harus:

1. Clean
2. Fast
3. Minimal
4. Teacher-friendly
5. Desktop-first
6. Tidak terasa seperti admin dashboard generik
7. Fokus pada content authoring

Prioritas visual:

```text
Content > Controls > Decoration
```

Jangan menggunakan terlalu banyak card, gradient, animasi, atau elemen dekoratif.

---

# 68. Core Question Types

## MVP

### Multiple Choice

```text
Question
Options
Correct Answer
Fraction
Feedback
```

### True / False

```text
Question
True
False
Correct Answer
```

### Short Answer

```text
Question
Accepted Answers
Case Sensitivity
```

### Essay

```text
Question
General Feedback
```

---

# 69. Phase 2 Question Types

```text
Multiple Choice Complex
Matching
Numerical
Cloze
```

Question engine harus dirancang agar penambahan type tidak membutuhkan perubahan besar.

Gunakan konsep:

```text
QuestionType
    ↓
Renderer
    ↓
Validator
    ↓
Serializer
    ↓
Exporter
```

---

# 70. Question Type Plugin Architecture

Konseptual:

```text
QuestionTypeDefinition

- type
- label
- icon
- schema
- editor
- validator
- previewRenderer
- moodleExporter
```

Contoh:

```text
multiple_choice
true_false
short_answer
essay
matching
numerical
```

Dengan pendekatan ini, question type baru dapat ditambahkan tanpa mengubah seluruh Quiz Builder.

---

# 71. Validation

Sebelum save:

Multiple Choice:

```text
Question content required
Minimum 2 options
At least 1 correct option
Option content required
```

True/False:

```text
Question required
Correct answer required
```

Short Answer:

```text
Question required
At least 1 accepted answer
```

Error harus muncul dekat field terkait.

---

# 72. Quiz Validation sebelum Export

Sebelum export:

```text
Quiz title required
At least 1 question
All questions valid
All referenced media available
Supported question type
```

Jika ada masalah:

```text
Export cannot continue.

3 questions need attention:

Question 4 — no correct answer
Question 12 — empty option C
Question 18 — missing image
```

User dapat klik issue untuk membuka soal tersebut.

---

# 73. Draft vs Complete

Question mempunyai status:

```text
Draft
Complete
```

Question dianggap complete apabila validation minimum terpenuhi.

Quiz dapat tetap disimpan meskipun memiliki draft questions.

Tetapi export harus menolak quiz yang invalid.

---

# 74. Audit / Metadata

Setiap resource sebaiknya memiliki:

```text
created_at
updated_at
created_by
updated_by
```

Untuk future collaboration.

---

# 75. Logging

Backend harus mencatat error penting:

```text
Authentication
Authorization
Upload
Export
Moodle integration
Unexpected exceptions
```

Jangan memasukkan content soal sensitif ke log secara berlebihan.

---

# 76. Automated Testing

Testing wajib dibangun sejak awal.

## Backend

Unit test:

```text
Question validation
Quiz validation
Question ordering
Authorization
Moodle XML serialization
```

## Frontend

Test:

```text
Question editor
Option editor
Paste parser
Autosave
Modal behavior
```

## Integration

Minimal:

```text
Create Quiz
Create Question
Upload Image
Save
Export Moodle XML
```

---

# 77. Moodle XML Testing

Setiap supported question type harus memiliki fixture.

Contoh:

```text
tests/fixtures/moodle/

multiple-choice.xml
true-false.xml
short-answer.xml
essay.xml
image-question.xml
equation-question.xml
```

Test:

```text
Internal Model
    ↓
Exporter
    ↓
Expected Moodle XML
```

Perbedaan format XML yang tidak bermakna harus dinormalisasi dalam testing.

---

# 78. Clipboard Testing

Karena Word Paste adalah fitur penting, testing harus mencakup:

```text
Plain text
HTML
Word HTML
Image
Multiple options
Tables
Basic formatting
```

Parser harus dibuat sebagai module terpisah agar mudah dites.

---

# 79. Parser Architecture

Buat module:

```text
ClipboardParser
```

dengan pipeline:

```text
ClipboardParser
 ├── PlainTextParser
 ├── HtmlParser
 ├── WordHtmlNormalizer
 ├── ImageExtractor
 ├── EquationParser
 └── OptionParser
```

Jangan memasukkan seluruh parser ke component UI.

---

# 80. Internal Document Architecture

Editor document harus menjadi canonical authoring representation.

```text
Document
 ├── Paragraph
 ├── Text
 ├── Heading
 ├── Image
 ├── Equation
 ├── Table
 ├── BulletList
 ├── OrderedList
 └── Link
```

Kemudian renderer:

```text
Document
 ├── Editor Renderer
 ├── Preview Renderer
 └── Moodle Renderer
```

---

# 81. Recommended Project Structure

Contoh frontend:

```text
src/
├── app/
├── components/
│   ├── quiz/
│   ├── question/
│   ├── editor/
│   ├── media/
│   └── ui/
├── features/
│   ├── quizzes/
│   ├── questions/
│   ├── clipboard/
│   ├── media/
│   └── export/
├── lib/
├── types/
└── services/
```

Backend:

```text
app/
├── Models/
├── Actions/
├── Services/
│   ├── Question/
│   ├── Clipboard/
│   ├── Media/
│   └── Export/
├── Policies/
├── Http/
├── Jobs/
└── Support/
```

Moodle exporter sebaiknya berdiri sebagai service/module terpisah.

---

# 82. Recommended Development Sequence

## Phase 0 — Foundation

* repository
* frontend
* backend
* database
* authentication
* CI
* linting
* testing
* environment configuration

---

## Phase 1 — Quiz CRUD

* Dashboard
* Quiz list
* Create quiz
* Edit quiz
* Delete quiz
* Quiz Builder shell

Acceptance:

> User dapat membuat quiz dan masuk ke Quiz Builder.

---

## Phase 2 — Question Engine

Implement:

* Question model
* Question options
* Multiple Choice
* True/False
* Short Answer
* Essay
* Validation

Acceptance:

> User dapat membuat semua question type MVP.

---

## Phase 3 — Modal Authoring

Implement:

* Large modal
* Create
* Edit
* Duplicate
* Delete
* Save
* Save & Add Another
* Question navigation

Acceptance:

> User dapat membuat 20 soal tanpa meninggalkan Quiz Builder.

---

## Phase 4 — Rich Text

Implement:

* Tiptap
* formatting
* list
* table
* link
* image
* equation

Acceptance:

> User dapat membuat rich-content question.

---

## Phase 5 — Word Paste

Implement:

* Clipboard API
* HTML extraction
* sanitization
* Word normalization
* image extraction
* bulk option parser

Acceptance:

> User dapat copy soal dari Word dan paste ke editor dengan minimal formatting loss.

---

## Phase 6 — Autosave & Recovery

Implement:

* debounce
* draft API
* local recovery
* unsaved warning
* save status

Acceptance:

> Browser refresh tidak langsung menyebabkan kehilangan draft.

---

## Phase 7 — Preview

Implement:

* quiz preview
* question preview
* image rendering
* equation rendering
* answer rendering

Acceptance:

> Preview menghasilkan tampilan yang konsisten dengan content model.

---

## Phase 8 — Moodle XML

Implement:

* exporter
* XML validation
* media handling
* automated fixtures
* download

Acceptance:

> Exported XML dapat di-import ke Moodle tanpa perbaikan manual untuk supported question types.

---

## Phase 9 — Library

Implement:

* My Quiz
* Shared Quiz
* Public Quiz
* search
* filter
* clone

Acceptance:

> User dapat menggunakan kembali quiz tanpa mengubah quiz original.

---

# 83. MVP Definition

MVP dianggap selesai jika user dapat melakukan workflow berikut:

```text
Login
 ↓
Create Quiz
 ↓
Quiz Builder
 ↓
Add Question
 ↓
Select Multiple Choice
 ↓
Paste question from Word
 ↓
Image ikut masuk
 ↓
Paste 5 answer options sekaligus
 ↓
Set correct answer
 ↓
Save & Add Another
 ↓
Create 20 questions
 ↓
Reorder questions
 ↓
Edit question
 ↓
Preview
 ↓
Export Moodle XML
 ↓
Import XML into Moodle
```

**Workflow tersebut adalah acceptance test utama produk.**

---

# 84. UX Acceptance Criteria

## Question Editor

* Tidak berpindah halaman.
* Tidak melakukan full page reload.
* Modal memiliki area editor yang luas.
* User dapat menyimpan soal.
* User dapat Save & Add Another.
* User dapat membatalkan perubahan.

## Rich Text

* Formatting dasar bekerja.
* Image dapat dimasukkan.
* Equation dapat dimasukkan.
* Table dapat dimasukkan.

## Word Paste

* Paste HTML diprioritaskan.
* Basic formatting dipertahankan.
* Image dapat diproses.
* Tidak membawa malicious HTML.
* Option dapat dipaste massal.

## Performance

* UI tidak freeze ketika mengetik.
* Autosave menggunakan debounce.
* Image upload mempunyai progress.
* Question list tidak reload seluruh halaman.

---

# 85. Future Roadmap

## Version 1.0

```text
Quiz Builder
Rich Editor
Word Paste
Image
Equation
Bulk Answers
Autosave
Preview
Moodle XML
```

## Version 1.5

```text
Question Bank
Quiz Library
Versioning
Matching
Numerical
Cloze
```

## Version 2.0

```text
Moodle API
Direct Publish
Moodle Course Integration
```

## Version 3.0

```text
AI Question Generator
Blueprint
Kisi-kisi
Cognitive Level
Automatic Question Review
Question Analysis
```

---

# 86. AI Integration — Future Architecture

AI jangan menjadi bagian core editor pada MVP.

Namun arsitektur harus memungkinkan:

```text
Question
    ↓
AI Service
    ↓
Generate / Improve / Analyze
```

Future actions:

```text
Improve wording
Generate distractors
Generate feedback
Generate similar question
Classify cognitive level
Generate question from blueprint
```

AI harus selalu menghasilkan **draft**, bukan langsung overwrite question tanpa user confirmation.

---

# 87. Potential School-Level Features

Untuk deployment sekolah:

```text
School
 ├── Teachers
 ├── Departments
 ├── Subjects
 ├── Shared Question Bank
 └── Shared Quiz Library
```

Contoh:

```text
SMK Bina Rahayu
│
├── TJKT
│   ├── X
│   ├── XI
│   └── XII
│
└── PPLG
    ├── X
    └── XI
```

Guru dapat membagikan quiz kepada organisasi/sekolah.

Fitur ini dapat menjadi basis implementasi multi-tenant di masa depan.

---

# 88. Multi-Tenant Readiness

Jika aplikasi akan digunakan lebih dari satu sekolah, model data harus dapat berkembang menjadi:

```text
Organization
   │
   ├── Users
   ├── Quizzes
   ├── Question Bank
   └── Library
```

MVP dapat menggunakan single organization, tetapi jangan hard-code nama sekolah ke database/business logic.

---

# 89. Important Architectural Rules

Agentic coding **WAJIB mengikuti prinsip berikut**:

### Rule 1

Jangan membuat Quiz Builder sebagai CRUD page tradisional.

Gunakan persistent authoring interface.

### Rule 2

Question Editor harus reusable untuk:

```text
Create
Edit
Duplicate
```

### Rule 3

Jangan reload seluruh Quiz Builder setelah perubahan question.

### Rule 4

Question content tidak boleh hanya dianggap arbitrary HTML.

Gunakan structured document model.

### Rule 5

Jangan membuat database mengikuti Moodle XML.

Moodle XML adalah output format.

### Rule 6

Clipboard/Word parser harus menjadi service/module terpisah.

### Rule 7

Media tidak disimpan sebagai base64 di database.

### Rule 8

Autosave tidak boleh melakukan request setiap keystroke.

### Rule 9

Question type harus extensible.

### Rule 10

Semua operasi user harus melalui authorization.

### Rule 11

MVP harus fokus pada authoring workflow, bukan fitur dekoratif.

### Rule 12

Jangan menambahkan library/framework baru tanpa alasan teknis yang jelas.

---

# 90. Definition of Done

Sebuah fitur dianggap selesai apabila:

1. Functional requirement terpenuhi.
2. UI responsive.
3. Loading state tersedia.
4. Error state tersedia.
5. Validation tersedia.
6. Authorization tersedia.
7. Automated test tersedia untuk logic penting.
8. Tidak merusak feature existing.
9. Tidak ada console error yang tidak ditangani.
10. Tidak ada database migration yang tidak terdokumentasi.
11. API mempunyai response contract yang konsisten.
12. Feature dapat dijelaskan dalam dokumentasi developer.

---

# 91. Development Philosophy

Agentic coding harus menggunakan pendekatan:

```text
Understand
   ↓
Plan
   ↓
Implement
   ↓
Test
   ↓
Review
   ↓
Refactor
   ↓
Document
```

Bukan:

```text
Prompt
 ↓
Generate huge amount of code
 ↓
Hope it works
```

Setiap phase harus menghasilkan increment yang dapat dijalankan.

---

# 92. Prioritas Fitur

Prioritas:

### P0 — Critical

```text
Authentication
Quiz CRUD
Question CRUD
Question Editor
Multiple Choice
True/False
Rich Text
Image
Save
Save & Add Another
Word Paste
Bulk Answer Paste
Preview
Moodle XML Export
```

### P1 — Important

```text
Autosave
Recovery
Duplicate
Drag & Drop
Short Answer
Essay
Library
Clone
Search
```

### P2 — Enhancement

```text
Question Bank
Versioning
Matching
Numerical
Cloze
```

### P3 — Future

```text
Moodle API
AI
Collaboration
Analytics
Multi-tenant
```

---

# 93. Product Success Metrics

Setelah aplikasi digunakan, metrik yang relevan:

### Authoring Speed

Berapa lama guru membuat:

```text
10 soal
20 soal
40 soal
```

Target produk:

> Waktu pembuatan soal turun dibandingkan workflow Word → Moodle manual.

### Paste Success Rate

Persentase Word paste yang berhasil mempertahankan:

* text
* formatting
* image
* equation

### Export Success Rate

Persentase XML yang berhasil di-import ke Moodle tanpa error.

### Recovery Success

Berapa banyak draft yang dapat dipulihkan setelah koneksi/browser interruption.

---

# 94. Primary Product Principle

Semua keputusan desain harus diuji dengan pertanyaan:

> **“Apakah fitur ini membuat guru membuat soal lebih cepat dan lebih aman?”**

Jika tidak:

* jangan ditambahkan ke MVP
* atau pindahkan ke fase berikutnya.

---

# 95. Final Product Definition

Produk akhir yang ingin dibangun bukan sekadar:

> “website untuk membuat soal.”

Melainkan:

> **Modern Question Authoring Platform yang memungkinkan guru membuat soal dengan workflow yang cepat, natural, dan kompatibel dengan Moodle.**

Workflow utamanya:

```text
              ┌───────────────────┐
              │       GURU        │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │    CREATE QUIZ    │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │   QUIZ BUILDER    │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │ QUESTION EDITOR   │
              │                   │
              │ Type              │
              │ Rich Text         │
              │ Word Paste        │
              │ Image             │
              │ Equation          │
              │ Bulk Answers      │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  QUESTION BANK    │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │      PREVIEW      │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  MOODLE EXPORT    │
              └─────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │      MOODLE       │
              └───────────────────┘
```

**Core differentiator:**

```text
Word
  ↓ Ctrl+C
Quiz Builder
  ↓ Ctrl+V
Question + Formatting + Image + Equation
  ↓
Bulk Answer Paste
  ↓
Save & Add Another
  ↓
Moodle
```

Itulah workflow yang harus menjadi pusat seluruh desain produk.

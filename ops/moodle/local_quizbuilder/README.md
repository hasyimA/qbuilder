# Moodle Local Plugin: `local_quizbuilder`

Plugin ringan untuk menghubungkan **Quiz Builder** dengan **Moodle** sehingga:
1. Hanya course yang diampu guru (`moodle/question:add`) yang ditampilkan (`local_quizbuilder_get_teaching_courses`).
2. Soal format Moodle XML dapat langsung diimpor ke Question Bank dan dibuatkan aktivitas Quiz (`local_quizbuilder_import_quiz_xml`).

## Cara Instalasi di Server Moodle

1. Salin seluruh folder `local_quizbuilder` ke direktori `local/` pada instalasi Moodle:
   ```bash
   cp -r ops/moodle/local_quizbuilder /path/to/moodle/local/quizbuilder
   ```
2. Masuk ke Moodle sebagai **Site Administrator**, buka **Site administration → Notifications**, lalu klik **Upgrade Moodle database now**.
3. Pastikan Web Services aktif (*Site administration → Server → Web services → Overview*):
   - **Enable web services** = Yes
   - **Enable protocols** = REST protocol
4. Kedua fungsi (`local_quizbuilder_get_teaching_courses` dan `local_quizbuilder_import_quiz_xml`) otomatis terdaftar pada service **`moodle_mobile_app`** (`MOODLE_OFFICIAL_MOBILE_SERVICE`), yang juga digunakan oleh Quiz Builder saat guru login.

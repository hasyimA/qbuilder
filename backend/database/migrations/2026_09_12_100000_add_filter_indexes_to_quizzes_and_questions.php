<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Question bank list filters on user + status + recency, ordered by
        // updated_at DESC. A composite index serves the whole path.
        Schema::table('questions', function (Blueprint $table) {
            $table->index(['user_id', 'status', 'updated_at'], 'idx_questions_user_status_updated');
            $table->index('category');
            $table->index('difficulty');
        });

        // Quiz library list filters on user + visibility + status + recency.
        Schema::table('quizzes', function (Blueprint $table) {
            $table->index(['user_id', 'visibility', 'status', 'updated_at'], 'idx_quizzes_user_vis_status_updated');
        });
    }

    public function down(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            $table->dropIndex('idx_questions_user_status_updated');
            $table->dropIndex(['category']);
            $table->dropIndex(['difficulty']);
        });

        Schema::table('quizzes', function (Blueprint $table) {
            $table->dropIndex('idx_quizzes_user_vis_status_updated');
        });
    }
};

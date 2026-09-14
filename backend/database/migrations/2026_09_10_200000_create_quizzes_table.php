<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quizzes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 255);
            $table->text('description')->nullable();
            $table->string('subject', 255)->nullable();
            $table->string('grade_level', 50)->nullable();
            $table->string('category', 255)->nullable();
            $table->string('status', 20)->default('draft');
            $table->string('visibility', 20)->default('private');
            $table->timestamps();

            $table->index('user_id');
            $table->index('status');
            $table->index('visibility');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quizzes');
    }
};

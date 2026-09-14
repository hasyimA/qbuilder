<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30);
            $table->json('content');
            $table->decimal('default_mark', 6, 2)->default(1.00);
            $table->json('feedback_general')->nullable();
            $table->json('feedback_correct')->nullable();
            $table->json('feedback_incorrect')->nullable();
            $table->string('category', 255)->nullable();
            $table->string('difficulty', 20)->nullable();
            $table->string('status', 20)->default('draft');
            $table->timestamps();

            $table->index('user_id');
            $table->index('type');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('questions');
    }
};

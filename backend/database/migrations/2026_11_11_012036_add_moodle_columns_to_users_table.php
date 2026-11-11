<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('moodle_user_id')->nullable()->unique()->after('status');
            $table->string('moodle_username')->nullable()->index()->after('moodle_user_id');
            $table->text('moodle_token')->nullable()->after('moodle_username');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['moodle_user_id']);
            $table->dropIndex(['moodle_username']);
            $table->dropColumn(['moodle_user_id', 'moodle_username', 'moodle_token']);
        });
    }
};

<?php

namespace App\Console\Commands;

use App\Models\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneOrphanedMedia extends Command
{
    protected $signature = 'media:prune {--d|delete : Delete orphaned files instead of only listing them}';

    protected $description = 'List (and optionally delete) files in the public media storage that have no matching media record';

    public function handle(): int
    {
        $disk = Storage::disk('public');
        $tracked = Media::query()
            ->pluck('storage_path')
            ->map(fn (string $path) => trim($path, '/'))
            ->flip();

        $orphans = collect($disk->allFiles('media'))
            ->filter(fn (string $path) => ! $tracked->has(trim($path, '/')))
            ->values();

        if ($orphans->isEmpty()) {
            $this->info('No orphaned media files found.');

            return self::SUCCESS;
        }

        foreach ($orphans as $path) {
            if ($this->option('delete')) {
                $disk->delete($path);
                $this->warn("Deleted orphan: {$path}");
            } else {
                $this->line($path);
            }
        }

        $this->info(sprintf('%d orphaned file(s) %s.', $orphans->count(), $this->option('delete') ? 'deleted' : 'found'));

        return self::SUCCESS;
    }
}

<?php

/*
|--------------------------------------------------------------------------
| PHP Built-in Server Router
|--------------------------------------------------------------------------
|
| The built-in PHP dev server (`php artisan serve`) serves static assets
| found under the public directory directly, bypassing the Laravel kernel.
| Because of that, `/storage/...` responses carry no CORS headers, which
| breaks cross-origin reads (e.g. the browser fetching file bytes during a
| Moodle export). This router adds the required headers for those static
| storage files and delegates everything else to the framework's router so
| behaviour is otherwise unchanged.
|
| Note: the built-in server runs this script with the public directory as
| the working directory, so `getcwd()` below points to `backend/public`.
|
*/

$publicPath = getcwd();

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

if (str_starts_with($uri, '/storage/')) {
    $file = $publicPath.'/'.ltrim($uri, '/');

    if (is_file($file)) {
        $contentTypes = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
        ];

        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));

        header('Access-Control-Allow-Origin: *');
        header('Vary: Origin');
        header('Content-Type: '.($contentTypes[$extension] ?? 'application/octet-stream'));
        header('Content-Length: '.filesize($file));
        readfile($file);

        return true;
    }
}

require_once __DIR__.'/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php';

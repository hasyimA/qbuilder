<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            if ($this->app->environment('testing')) {
                return Limit::none();
            }

            return Limit::perMinute(10)
                ->by(strtolower((string) $request->input('email')).'|'.$request->ip());
        });

        RateLimiter::for('upload', function (Request $request) {
            if ($this->app->environment('testing')) {
                return Limit::none();
            }

            $user = $request->user();

            return $user
                ? Limit::perMinute(30)->by('upload:'.$user->id)
                : Limit::perMinute(5)->by('upload:'.$request->ip());
        });

        RateLimiter::for('mutations', function (Request $request) {
            if ($this->app->environment('testing')) {
                return Limit::none();
            }

            $user = $request->user();

            return $user
                ? Limit::perMinute(120)->by('mutations:'.$user->id)
                : Limit::perMinute(10)->by('mutations:'.$request->ip());
        });
    }
}

# Testing Strategy

## Overview

Testing is built-in from day one. Every feature must be testable. Tests run as part of the Definition of Done.

## Testing Pyramid

```
           ┌─────────┐
           │  E2E    │  Future (Playwright)
           │ (small) │
          ┌┴─────────┴┐
          │ Integration │  Feature tests (API)
          │  (medium)   │
         ┌┴─────────────┴┐
         │  Unit Tests     │  Services, parsers, exporters
         │   (large)       │
         └─────────────────┘
```

## Backend Testing (PHPUnit)

### Configuration

- **Framework**: PHPUnit 12.x
- **Database**: SQLite `:memory:` for tests
- **Traits**: `RefreshDatabase` for test isolation
- **Config**: `backend/phpunit.xml`

### Test Structure

```
tests/
├── TestCase.php                  # Base test class
├── Feature/
│   ├── AuthTest.php              # (exists) Auth endpoints
│   ├── QuizTest.php              # Quiz CRUD
│   ├── QuestionTest.php          # Question CRUD
│   ├── QuestionOptionTest.php    # Answer options
│   ├── QuestionOrderTest.php     # Reorder
│   ├── MediaTest.php             # Upload/delete
│   └── ExportTest.php            # Moodle XML export
├── Unit/
│   ├── Services/
│   │   ├── QuizServiceTest.php
│   │   ├── QuestionServiceTest.php
│   │   └── ClipboardParserTest.php
│   ├── Export/
│   │   └── MoodleXmlExporterTest.php
│   ├── Policies/
│   │   ├── QuizPolicyTest.php
│   │   └── QuestionPolicyTest.php
│   └── Validators/
│       └── ContentModelValidatorTest.php
└── fixtures/
    └── moodle/
        ├── multiple-choice.xml
        ├── true-false.xml
        ├── short-answer.xml
        ├── essay.xml
        ├── image-question.xml
        └── equation-question.xml
```

### Feature Test Pattern

```php
class QuizTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_quiz(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/quizzes', [
                'title' => 'UTS Network System',
                'subject' => 'Network System',
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => ['id', 'title', 'status'],
                'message',
            ]);

        $this->assertDatabaseHas('quizzes', [
            'title' => 'UTS Network System',
            'user_id' => $user->id,
        ]);
    }

    public function test_user_cannot_access_other_users_quiz(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $quiz = Quiz::factory()->create(['user_id' => $owner->id]);

        $token = $other->createToken('test')->plainTextToken;
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/quizzes/{$quiz->id}");

        $response->assertStatus(403);
    }
}
```

### Unit Test Pattern

```php
class ClipboardParserTest extends TestCase
{
    public function test_parse_multiple_choice_options(): void
    {
        $parser = new ClipboardParser();
        $input = "A. Router\nB. Switch\nC. Hub\nD. Access Point";

        $result = $parser->parseOptions($input);

        $this->assertCount(4, $result);
        $this->assertEquals('Router', $result[0]['text']);
        $this->assertEquals('A', $result[0]['label']);
    }

    public function test_parse_html_from_word(): void
    {
        $parser = new ClipboardParser();
        $html = '<p style="mso-normal">Hello <b>world</b></p>';

        $result = $parser->parseHtml($html);

        $this->assertEquals('doc', $result['type']);
        $this->assertCount(1, $result['content']);
    }
}
```

### Moodle XML Fixture Test

```php
class MoodleXmlExporterTest extends TestCase
{
    public function test_export_multiple_choice(): void
    {
        $quiz = Quiz::factory()->create();
        $question = Question::factory()->multipleChoice()->create();
        // ... attach options, add to quiz

        $exporter = new MoodleXmlExporter();
        $xml = $exporter->export($quiz);

        $this->assertStringContainsString('<question type="category">', $xml);
        $this->assertStringContainsString('multiple_choice', $xml);

        // Validate against fixture
        $expected = file_get_contents(__DIR__ . '/fixtures/moodle/multiple-choice.xml');
        $this->assertXmlStringEqualsXmlString($expected, $xml);
    }
}
```

## Frontend Testing (Future)

### Testing Tools

| Tool | Purpose | Phase |
|------|---------|-------|
| Vitest | Unit tests | Phase 4+ |
| React Testing Library | Component tests | Phase 4+ |
| Playwright | E2E tests | Phase 8+ |

### Test Structure (Planned)

```
frontend/src/
├── __tests__/
│   ├── components/
│   │   ├── QuizCard.test.tsx
│   │   └── QuestionEditor.test.tsx
│   ├── features/
│   │   ├── clipboard/
│   │   │   ├── wordPaste.test.ts
│   │   │   └── bulkOptionParser.test.ts
│   │   └── export/
│   │       └── moodlePreview.test.ts
│   └── lib/
│       ├── api.test.ts
│       └── sanitizer.test.ts
```

### Clipboard Parser Test (Critical)

```typescript
describe('WordPasteParser', () => {
  it('parses formatted text from Word', () => {
    const html = `
      <p style="mso-normal">Perangkat <b>router</b> berfungsi untuk...</p>
      <p><img src="cid:image001.jpg"></p>
    `;

    const result = parseWordHtml(html);

    expect(result.type).toBe('doc');
    expect(result.content[0].content[0].marks).toContainEqual({ type: 'bold' });
  });

  it('extracts images from Word paste', () => {
    const html = '<p><img src="cid:image001.png"></p>';
    const files = extractImagesFromHtml(html);

    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/\.png$/);
  });
});
```

## Test Commands

### Backend

```bash
# Run all tests
cd backend && php artisan test

# Run specific test file
cd backend && php artisan test tests/Feature/QuizTest.php

# Run with coverage
cd backend && php artisan test --coverage

# Run specific test method
cd backend && php artisan test --filter=test_user_can_create_quiz
```

### Frontend

```bash
# Run all tests (when configured)
cd frontend && bun run test

# Run with coverage
cd frontend && bun run test:coverage
```

## Quality Gates

Every PR/commit must pass:

| Gate | Command | Must Pass |
|------|---------|-----------|
| PHP Tests | `php artisan test` | 100% |
| PHP Lint | `./vendor/bin/pint --test` | 100% |
| TypeScript Build | `bun run build` | 0 errors |
| ESLint | `bun run lint` | 0 errors |
| No console errors | Manual check | Clean |

## Test Coverage Targets

| Module | Target | Priority |
|--------|--------|----------|
| Auth | 100% | P0 |
| Quiz CRUD | 100% | P0 |
| Question CRUD | 100% | P0 |
| Clipboard Parser | 100% | P0 |
| Moodle Exporter | 100% | P0 |
| Authorization | 100% | P0 |
| Media | 90% | P1 |
| Frontend components | 80% | P2 |

## Test Data

### Factories

```
database/factories/
├── UserFactory.php        # (exists)
├── QuizFactory.php
├── QuestionFactory.php
├── QuestionOptionFactory.php
├── QuizQuestionFactory.php
└── MediaFactory.php
```

### Factory Pattern

```php
class QuizFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(),
            'status' => 'draft',
            'visibility' => 'private',
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => ['status' => 'published']);
    }
}

class QuestionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => 'multiple_choice',
            'content' => ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => fake()->sentence()]]]]],
            'default_mark' => 1.00,
            'status' => 'complete',
        ];
    }

    public function multipleChoice(): static
    {
        return $this->state(fn () => ['type' => 'multiple_choice']);
    }

    public function trueFalse(): static
    {
        return $this->state(fn () => ['type' => 'true_false']);
    }
}
```

## CI Integration (Future)

```yaml
# .github/workflows/test.yml (Phase 0 already done, extend for tests)
name: Test
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
      - run: cd backend && composer install
      - run: cd backend && php artisan test

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: cd frontend && bun install
      - run: cd frontend && bun run build
```

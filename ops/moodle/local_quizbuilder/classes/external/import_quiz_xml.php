<?php
// This file is part of Moodle - http://moodle.org/

namespace local_quizbuilder\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');
require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/mod/quiz/lib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

class import_quiz_xml extends \external_api
{
    public static function execute_parameters(): \external_function_parameters
    {
        return new \external_function_parameters([
            'courseid' => new \external_value(PARAM_INT, 'Target Moodle course ID'),
            'quizname' => new \external_value(PARAM_TEXT, 'Quiz title and question category name'),
            'quizintro' => new \external_value(PARAM_RAW, 'Quiz description/intro HTML', VALUE_DEFAULT, ''),
            'xml' => new \external_value(PARAM_RAW, 'Moodle XML content'),
            'section' => new \external_value(PARAM_INT, 'Course section number', VALUE_DEFAULT, 0),
        ]);
    }

    public static function execute(
        int $courseid,
        string $quizname,
        string $quizintro = '',
        string $xml = '',
        int $section = 0
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'quizname' => $quizname,
            'quizintro' => $quizintro,
            'xml' => $xml,
            'section' => $section,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = \context_course::instance($course->id);
        self::validate_context($context);

        require_capability('moodle/question:add', $context);
        require_capability('mod/quiz:addinstance', $context);

        if (trim($params['xml']) === '') {
            throw new \invalid_parameter_exception('Moodle XML content cannot be empty.');
        }

        // 1. Create a dedicated question bank category for this import.
        $defaultcat = question_make_default_categories([$context]);
        $categoryname = trim($params['quizname']) ?: ('Quiz Builder ' . date('Y-m-d H:i'));
        $uniqueSuffix = date('Y-m-d H:i:s');

        $category = new \stdClass();
        $category->name = $categoryname . ' [' . $uniqueSuffix . ']';
        $category->contextid = $context->id;
        $category->info = 'Imported from Quiz Builder';
        $category->infoformat = FORMAT_HTML;
        $category->parent = $defaultcat->id;
        $category->sortorder = 999;
        $category->stamp = make_unique_id_code();
        $category->id = $DB->insert_record('question_categories', $category);

        // 2. Write XML to a temporary file and import via qformat_xml.
        $tempdir = make_request_directory();
        $filepath = $tempdir . '/quizbuilder_import.xml';
        if (file_put_contents($filepath, $params['xml']) === false) {
            throw new \moodle_exception('cannotcreatetempdir', 'error');
        }

        $qformat = new \qformat_xml();
        $qformat->setCategory($category);
        $qformat->setContexts([$context]);
        $qformat->setCourse($course);
        $qformat->setFilename($filepath);
        $qformat->setRealfilename('quizbuilder_import.xml');
        $qformat->setMatchgrades('error');
        $qformat->setCatfromfile(false);
        $qformat->setContextfromfile(false);
        $qformat->setStoponerror(true);

        // qformat_xml echoes HTML progress/notifications directly; buffer it so REST JSON stays valid.
        ob_start();
        try {
            if (!$qformat->importpreprocess()) {
                throw new \moodle_exception('cannotimportformat', 'question');
            }
            if (!$qformat->importprocess()) {
                throw new \moodle_exception('cannotimportformat', 'question');
            }
            if (!$qformat->importpostprocess()) {
                throw new \moodle_exception('cannotimportformat', 'question');
            }
        } finally {
            ob_end_clean();
        }

        // 3. Collect imported question IDs (Moodle 4.x and 3.x compatible).
        $questionids = self::get_category_question_ids((int) $category->id);
        $importedcount = count($questionids);

        if ($importedcount === 0) {
            throw new \moodle_exception('noquestions', 'question');
        }

        // 4. Create the Quiz activity in the target course.
        $module = $DB->get_record('modules', ['name' => 'quiz'], '*', MUST_EXIST);
        $moduleinfo = new \stdClass();
        $moduleinfo->modulename = 'quiz';
        $moduleinfo->module = $module->id;
        $moduleinfo->course = $course->id;
        $moduleinfo->section = max(0, (int) $params['section']);
        $moduleinfo->visible = 1;
        $moduleinfo->name = $categoryname;
        $moduleinfo->intro = $params['quizintro'];
        $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->timeopen = 0;
        $moduleinfo->timeclose = 0;
        $moduleinfo->timelimit = 0;
        $moduleinfo->overduehandling = 'autosubmit';
        $moduleinfo->graceperiod = 0;
        $moduleinfo->preferredbehaviour = 'deferredfeedback';
        $moduleinfo->attempts = 0;
        $moduleinfo->attemptonlast = 0;
        $moduleinfo->grademethod = 1;
        $moduleinfo->decimalpoints = 2;
        $moduleinfo->questiondecimalpoints = -1;
        $moduleinfo->questionsperpage = 1;
        $moduleinfo->navmethod = 'free';
        $moduleinfo->shuffleanswers = 1;
        $moduleinfo->sumgrades = 0;
        $moduleinfo->grade = 100;
        $moduleinfo->quizpassword = '';
        $moduleinfo->subnet = '';
        $moduleinfo->browsersecurity = '-';
        $moduleinfo->delay1 = 0;
        $moduleinfo->delay2 = 0;
        $moduleinfo->showuserpicture = 0;
        $moduleinfo->showblocks = 0;
        $moduleinfo->completion = 0;
        // Standard review options bitmask defaults.
        $moduleinfo->reviewattempt = 69904;
        $moduleinfo->reviewcorrectness = 4368;
        $moduleinfo->reviewmarks = 4368;
        $moduleinfo->reviewspecificfeedback = 4368;
        $moduleinfo->reviewgeneralfeedback = 4368;
        $moduleinfo->reviewrightanswer = 4368;
        $moduleinfo->reviewoverallfeedback = 4368;

        ob_start();
        try {
            $created = add_moduleinfo($moduleinfo, $course);
        } finally {
            ob_end_clean();
        }
        $quiz = $DB->get_record('quiz', ['id' => $created->instance], '*', MUST_EXIST);

        // 5. Add imported questions to the created quiz and recompute sumgrades.
        foreach ($questionids as $qid) {
            quiz_add_quiz_question($qid, $quiz);
        }

        if (class_exists('\mod_quiz\grade_calculator') && class_exists('\mod_quiz\quiz_settings')) {
            $quizobj = \mod_quiz\quiz_settings::create($quiz->id);
            \mod_quiz\grade_calculator::create($quizobj)->recompute_quiz_sumgrades();
        } elseif (function_exists('quiz_update_sumgrades')) {
            quiz_update_sumgrades($quiz);
        }

        $quizurl = (new \moodle_url('/mod/quiz/view.php', ['id' => $created->coursemodule]))->out(false);

        return [
            'status' => true,
            'imported_count' => $importedcount,
            'category_id' => (int) $category->id,
            'category_name' => (string) $category->name,
            'quiz_id' => (int) $quiz->id,
            'quiz_cmid' => (int) $created->coursemodule,
            'quiz_url' => (string) $quizurl,
        ];
    }

    /**
     * Fetch question IDs inside a question category across Moodle 3.x and 4.x schemas.
     *
     * @return int[]
     */
    private static function get_category_question_ids(int $categoryid): array
    {
        global $DB;

        $dbman = $DB->get_manager();

        if ($dbman->table_exists('question_bank_entries') && $dbman->table_exists('question_versions')) {
            $sql = "SELECT qv.questionid
                      FROM {question_bank_entries} qbe
                      JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                     WHERE qbe.questioncategoryid = :categoryid
                  ORDER BY qbe.id ASC, qv.version DESC";
            $records = $DB->get_records_sql($sql, ['categoryid' => $categoryid]);
            return array_values(array_map('intval', array_keys($records)));
        }

        $records = $DB->get_records('question', ['category' => $categoryid], 'id ASC', 'id');
        return array_values(array_map('intval', array_keys($records)));
    }

    public static function execute_returns(): \external_single_structure
    {
        return new \external_single_structure([
            'status' => new \external_value(PARAM_BOOL, 'Import success flag'),
            'imported_count' => new \external_value(PARAM_INT, 'Number of questions imported'),
            'category_id' => new \external_value(PARAM_INT, 'Created question bank category ID'),
            'category_name' => new \external_value(PARAM_TEXT, 'Created question bank category name'),
            'quiz_id' => new \external_value(PARAM_INT, 'Created quiz instance ID'),
            'quiz_cmid' => new \external_value(PARAM_INT, 'Created quiz course module ID'),
            'quiz_url' => new \external_value(PARAM_URL, 'Direct URL to open the created quiz in Moodle'),
        ]);
    }
}

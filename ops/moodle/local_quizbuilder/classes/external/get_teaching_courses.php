<?php
// This file is part of Moodle - http://moodle.org/

namespace local_quizbuilder\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

class get_teaching_courses extends \external_api
{
    public static function execute_parameters(): \external_function_parameters
    {
        return new \external_function_parameters([]);
    }

    public static function execute(): array
    {
        global $USER;

        self::validate_parameters(self::execute_parameters(), []);

        $courses = enrol_get_users_courses($USER->id, true, 'id, shortname, fullname, category, visible');
        $teachingcourses = [];

        foreach ($courses as $course) {
            $context = \context_course::instance($course->id, IGNORE_MISSING);
            if (!$context) {
                continue;
            }

            if (!has_capability('moodle/question:add', $context)) {
                continue;
            }

            $teachingcourses[] = [
                'id' => (int) $course->id,
                'shortname' => (string) $course->shortname,
                'fullname' => (string) $course->fullname,
                'displayname' => (string) ($course->fullname ?: $course->shortname),
                'category' => (int) $course->category,
                'visible' => (bool) $course->visible,
            ];
        }

        return $teachingcourses;
    }

    public static function execute_returns(): \external_multiple_structure
    {
        return new \external_multiple_structure(
            new \external_single_structure([
                'id' => new \external_value(PARAM_INT, 'Course ID'),
                'shortname' => new \external_value(PARAM_TEXT, 'Course short name'),
                'fullname' => new \external_value(PARAM_TEXT, 'Course full name'),
                'displayname' => new \external_value(PARAM_TEXT, 'Course display name'),
                'category' => new \external_value(PARAM_INT, 'Course category ID'),
                'visible' => new \external_value(PARAM_BOOL, 'Course visibility'),
            ])
        );
    }
}

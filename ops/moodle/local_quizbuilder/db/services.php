<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_quizbuilder_get_teaching_courses' => [
        'classname'   => 'local_quizbuilder\external\get_teaching_courses',
        'methodname'  => 'execute',
        'description' => 'Get courses where the authenticated user has teacher/question-editing permissions.',
        'type'        => 'read',
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'local_quizbuilder_import_quiz_xml' => [
        'classname'   => 'local_quizbuilder\external\import_quiz_xml',
        'methodname'  => 'execute',
        'description' => 'Import Moodle XML questions into a course question bank and create a quiz activity.',
        'type'        => 'write',
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
];

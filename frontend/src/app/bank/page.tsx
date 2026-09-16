'use client';

import QuestionBank from '@/components/question-bank/question-bank';
import { AppShell } from '@/components/layout';

export default function BankPage() {
  return (
    <AppShell>
      <QuestionBank />
    </AppShell>
  );
}
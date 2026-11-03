import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'DR-I Social Publisher - Agent',
  description: '',
};

export default async function Page() {
  return redirect('/agents/new');
}

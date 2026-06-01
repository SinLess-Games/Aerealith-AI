import { redirect } from 'next/navigation';

type ProcileRedirectPageProps = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProcileRedirectPage({
  params,
}: ProcileRedirectPageProps) {
  const { username } = await params;

  redirect(`/.profile/${encodeURIComponent(username)}`);
}

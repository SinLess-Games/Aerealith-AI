'use client';

import { ProfileErrorState } from '@aerealith-ai/ui';

export default function PrivateProfileError() {
  return (
    <ProfileErrorState message="The private profile dashboard could not be loaded." />
  );
}

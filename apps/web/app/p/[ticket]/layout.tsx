import { AccessibilityToggle } from '@/components/AccessibilityToggle';

/**
 * Patient-area layout — mounts the AccessibilityToggle on every patient
 * surface (queue view + intake chat) without intruding on the clinician
 * dashboard, which has its own layout via app/dashboard/page.tsx.
 */
export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AccessibilityToggle />
    </>
  );
}

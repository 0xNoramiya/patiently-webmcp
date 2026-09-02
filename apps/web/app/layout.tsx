import type { Metadata, Viewport } from 'next';

import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { WebMCPRuntime } from '@/components/WebMCPRuntime';
import { SITE_URL, TOOL_COUNT } from '@/lib/webmcp/catalog';

import './globals.css';

const TITLE = 'Patiently — a clinic your agent can actually use';
const DESCRIPTION =
  `An outpatient clinic that exposes its queue, charts and prescriptions as ${TOOL_COUNT} WebMCP tools. ` +
  'A doctor runs their floor by talking; a patient does intake in their own language. ' +
  "Every action that touches a patient's care stops and waits for a human to click.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · Patiently' },
  description: DESCRIPTION,
  applicationName: 'Patiently',
  manifest: '/manifest.webmanifest',
  alternates: {
    canonical: '/',
    types: {
      // Point agents at the plain-text brief from the HTML itself.
      'text/plain': [{ url: '/llms.txt', title: 'llms.txt — agent brief' }],
    },
  },
  keywords: [
    'WebMCP',
    'document.modelContext',
    'agent-native web',
    'AI agent tools',
    'clinic queue',
    'pre-visit intake',
    'human-in-the-loop',
  ],
  authors: [{ name: 'Muhammad Rifqi Haikal', url: 'https://github.com/0xNoramiya' }],
  creator: 'Muhammad Rifqi Haikal',
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Patiently',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  appleWebApp: { capable: true, title: 'Patiently', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  formatDetection: { telephone: false },
  other: {
    // Non-standard, but this is what the WebMCP readiness auditors look for,
    // and it costs nothing to state the capability in the head.
    'webmcp-enabled': 'true',
    'webmcp-manifest': `${SITE_URL}/.well-known/webmcp`,
    'webmcp-tools': String(TOOL_COUNT),
  },
};

export const viewport: Viewport = {
  themeColor: '#0e8265',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

/**
 * Structured data.
 *
 * Deliberately typed as SoftwareApplication rather than MedicalClinic: this is
 * a demonstration, not a real practice, and claiming to be a medical
 * organisation in structured data would be a lie told to machines.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Patiently',
      description: DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#author` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#author`,
      name: 'Muhammad Rifqi Haikal',
      url: 'https://github.com/0xNoramiya',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Patiently',
      url: `${SITE_URL}/`,
      applicationCategory: 'HealthApplication',
      applicationSubCategory: 'Agent-native web application',
      operatingSystem: 'Any modern web browser',
      description: DESCRIPTION,
      author: { '@id': `${SITE_URL}/#author` },
      license: 'https://opensource.org/licenses/MIT',
      codeRepository: 'https://github.com/0xNoramiya/patiently-webmcp',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        `${TOOL_COUNT} WebMCP tools across three surfaces`,
        'Human confirmation required for every clinical write',
        'Independent triage classifier with server-side escalation',
        'Prompt-injection fencing on patient-authored text',
        'Pre-visit chart, SOAP note and prescription drafting',
        'Drug-interaction screening',
        'Bilingual intake (English and Bahasa Indonesia)',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is WebMCP and how does this site use it?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `WebMCP lets a web page expose structured tools to an AI agent through document.modelContext. Patiently registers ${TOOL_COUNT} tools across three pages, so an agent can read the clinic queue, pull a pre-visit chart, and draft clinical documents inside the session the user is already signed into — with no API key or separate server.`,
          },
        },
        {
          '@type': 'Question',
          name: 'Can the agent prescribe medication on its own?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Prescription signing, recording vitals, calling a patient in and closing a visit each open a confirmation dialog and block until a clinician clicks. The write only exists on the approved branch, so the model cannot route around it.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can a patient use their agent to move up the queue?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "No. There is no tool that changes queue priority. Escalation is decided server-side by an independent triage classifier reading the patient's own words, so a patient's agent can describe symptoms honestly but cannot argue its way to the front.",
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need a special browser?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "ChatGPT's in-app browser supports WebMCP by default, and Chrome 149+ does with chrome://flags/#enable-webmcp-testing enabled. Everywhere else the site installs a WebMCP polyfill itself, so the tools are still registered and discoverable.",
          },
        },
        {
          '@type': 'Question',
          name: 'Is the patient data real?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Every patient, visit, prescription and consultation transcript in this deployment is synthetic. Nothing here is medical advice.',
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Discovery surfaces, advertised from the document itself. */}
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
        <link
          rel="alternate"
          type="application/json"
          href="/.well-known/webmcp"
          title="WebMCP tool manifest"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <WebMCPRuntime />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

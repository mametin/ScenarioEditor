import type { Metadata, Viewport } from 'next';
import './globals.css';
import './workbench.css';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const metadata: Metadata = { title: 'TRPG Scenario Editor', description: '物語と、その可能性をつなぐ執筆環境', manifest: `${basePath}/manifest.webmanifest`, appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Scenario Editor' } };
export const viewport: Viewport = { themeColor: '#f5f4ef', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}<script src={`${basePath}/register-sw.js`} defer /></body></html>; }

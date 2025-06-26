import { Providers } from './providers';

export const metadata = {
  title: 'Grid Monitoring Tool',
  description: 'Real-time monitoring and simulation of electrical grid networks',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
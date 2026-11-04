import './globals.css';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <ToastContainer
          position="top-right"
          autoClose={20_000}
          closeOnClick={false}
          newestOnTop
          pauseOnHover
          draggable
          theme="colored"
        />
      </body>
    </html>
  );
}

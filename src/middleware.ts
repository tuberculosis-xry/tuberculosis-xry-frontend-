import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authSession = request.cookies.get('auth-session');
  const { pathname } = request.nextUrl;

  // Define route types
  const isAuthRoute = pathname === '/login';
  const isPublicRoute = pathname === '/' || isAuthRoute;
  const isProtectedRoute = pathname.startsWith('/dashboard');

  // 1. Redirect authenticated users away from public landing/auth pages to /dashboard
  if (authSession && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 2. Redirect unauthenticated users away from protected pages to public landing page (/)
  if (!authSession && isProtectedRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, site.webmanifest (favicon and PWA manifest)
     * - .png, .jpg, .jpeg, .gif, .svg, .webp, .ico (public assets)
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|site\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)',
  ],
};

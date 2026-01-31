import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    console.log('=== GOOGLE AUTH GUARD ===');
    console.log('URL:', request.url);
    console.log('Session ID:', request.sessionID);
    console.log('Session:', JSON.stringify(request.session, null, 2));
    console.log('Query state:', request.query?.state);
    console.log('=== END GUARD DEBUG ===');
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('=== GUARD handleRequest ===');
    console.log('Error:', err?.message || err);
    console.log('User:', user);
    console.log('Info:', info?.message || info);
    console.log('=== END handleRequest ===');

    if (err || !user) {
      throw err || new Error('OAuth authentication failed');
    }
    return user;
  }
}

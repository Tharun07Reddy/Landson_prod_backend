import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a route as public (no authentication required)
 * 
 * @example
 * @Public()
 * @Get('public-endpoint')
 * publicEndpoint() {
 *   return 'This endpoint is public';
 * }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true); 
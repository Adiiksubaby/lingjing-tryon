import type { Role } from '@lingjing/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      role: Role;
      name: string;
    };
  }
}

export type AuthUser = {
  id: string;
  role: Role;
  name: string;
};

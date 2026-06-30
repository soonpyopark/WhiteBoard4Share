import { parseAllowedHosts } from './request-origin.ts';

export interface KeycloakConfig {
  enabled: boolean;
  url: string;
  keycloakServerUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  appBaseUrl: string;
  roleSuper: string;
  roleDept: string;
  allowLocal: boolean;
  dynamicOrigin: boolean;
  allowedHosts: string[];
}

export function getKeycloakConfig(): KeycloakConfig {
  const port = parseInt(process.env.PORT ?? '3007', 10);
  const defaultBase = `http://localhost:${port}`;
  const keycloakUrl = (process.env.KEYCLOAK_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return {
    enabled: process.env.KEYCLOAK_ENABLED === 'true',
    url: keycloakUrl,
    keycloakServerUrl: (process.env.KEYCLOAK_SERVER_URL ?? keycloakUrl).replace(/\/$/, ''),
    realm: process.env.KEYCLOAK_REALM ?? 'master',
    clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'whiteboard4share',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
    appBaseUrl: (process.env.APP_BASE_URL ?? defaultBase).replace(/\/$/, ''),
    roleSuper: process.env.KEYCLOAK_ROLE_SUPER ?? 'super-admin',
    roleDept: process.env.KEYCLOAK_ROLE_DEPT ?? 'dept-admin',
    allowLocal: process.env.KEYCLOAK_ALLOW_LOCAL !== 'false',
    dynamicOrigin: process.env.KEYCLOAK_DYNAMIC_ORIGIN !== 'false',
    allowedHosts: parseAllowedHosts(),
  };
}

export function getKeycloakIssuer(config: KeycloakConfig): string {
  return `${config.url}/realms/${config.realm}`;
}

export function getKeycloakRedirectUri(config: KeycloakConfig): string {
  return `${config.appBaseUrl}/api/auth/keycloak/callback`;
}

export function getKeycloakPostLogoutRedirectUri(config: KeycloakConfig): string {
  const explicit = process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit.endsWith('/') ? explicit : `${explicit}/`;
  }
  return `${config.appBaseUrl.replace(/\/$/, '')}/`;
}

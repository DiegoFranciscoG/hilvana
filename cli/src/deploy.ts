/**
 * Plan de despliegue en Google Cloud (Cloud Run, Artifact Registry, Cloud Build, Secret Manager).
 * Se muestra completo y solo se ejecuta con confirmación explícita. Los valores secretos entran por
 * la entrada estándar de gcloud, nunca en la línea de comandos.
 * Requiere una cuenta de facturación activa (docs/investigacion.md #44).
 */

export interface DeployOptions {
  project: string;
  region: string;
  tag: string;
  service?: string;
  repository?: string;
  supabaseUrl: string;
  dbHost: string;
}

export interface DeployStep {
  description: string;
  command: string[];
  /** Variable de entorno local cuyo valor se pasa por stdin (secretos). */
  stdinFromEnv?: string;
  /** El paso puede fallar si el recurso ya existe. */
  tolerateFailure?: boolean;
}

export const PLATFORM_SECRETS: { name: string; env: string; runEnv: string }[] = [
  { name: 'hilvana-telar-db-password', env: 'TELAR_DB_PASSWORD', runEnv: 'TELAR_DB_PASSWORD' },
  { name: 'hilvana-supabase-secret-key', env: 'SUPABASE_SECRET_KEY', runEnv: 'SUPABASE_SECRET_KEY' },
  { name: 'hilvana-drain-token', env: 'TELAR_DRAIN_TOKEN', runEnv: 'TELAR_DRAIN_TOKEN' },
];

export function validateDeployOptions(options: DeployOptions): string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(options.project)) problems.push('id de proyecto inválido');
  if (!/^[a-z]+-[a-z]+\d$/.test(options.region)) problems.push('región inválida (ej.: us-central1)');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(options.tag)) problems.push('etiqueta de imagen inválida');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(options.supabaseUrl)) problems.push('SUPABASE_URL debe ser https');
  if (!/^[a-z0-9.-]+$/.test(options.dbHost)) problems.push('host de base inválido');
  return problems;
}

export function deployPlan(options: DeployOptions): DeployStep[] {
  const service = options.service ?? 'hilvana-telar';
  const repository = options.repository ?? 'hilvana';
  const image = `${options.region}-docker.pkg.dev/${options.project}/${repository}/telar:${options.tag}`;
  const serviceAccount = `hilvana-telar@${options.project}.iam.gserviceaccount.com`;
  const steps: DeployStep[] = [
    { description: 'Seleccionar el proyecto', command: ['gcloud', 'config', 'set', 'project', options.project] },
    {
      description: 'Activar las APIs necesarias',
      command: [
        'gcloud',
        'services',
        'enable',
        'run.googleapis.com',
        'cloudbuild.googleapis.com',
        'artifactregistry.googleapis.com',
        'secretmanager.googleapis.com',
      ],
    },
    {
      description: 'Crear el repositorio de imágenes (si no existe)',
      command: [
        'gcloud',
        'artifacts',
        'repositories',
        'create',
        repository,
        '--repository-format=docker',
        `--location=${options.region}`,
      ],
      tolerateFailure: true,
    },
    {
      description: 'Crear la cuenta de servicio del Telar (si no existe)',
      command: ['gcloud', 'iam', 'service-accounts', 'create', 'hilvana-telar', '--display-name=Hilvana Telar'],
      tolerateFailure: true,
    },
  ];
  for (const secret of PLATFORM_SECRETS) {
    steps.push(
      {
        description: `Crear el secreto ${secret.name} (si no existe)`,
        command: ['gcloud', 'secrets', 'create', secret.name, '--replication-policy=automatic'],
        tolerateFailure: true,
      },
      {
        description: `Cargar una versión de ${secret.name} desde $${secret.env}`,
        command: ['gcloud', 'secrets', 'versions', 'add', secret.name, '--data-file=-'],
        stdinFromEnv: secret.env,
      },
      {
        description: `Permitir que el Telar lea ${secret.name}`,
        command: [
          'gcloud',
          'secrets',
          'add-iam-policy-binding',
          secret.name,
          `--member=serviceAccount:${serviceAccount}`,
          '--role=roles/secretmanager.secretAccessor',
        ],
      },
    );
  }
  steps.push(
    {
      description: 'Construir y publicar la imagen con Cloud Build',
      command: [
        'gcloud',
        'builds',
        'submit',
        '--config=cloud/cloudbuild.yaml',
        `--substitutions=_REGION=${options.region},_REPOSITORY=${repository},_TAG=${options.tag}`,
        '.',
      ],
    },
    {
      description: 'Desplegar el Telar en Cloud Run (facturación por solicitud, escala a cero)',
      command: [
        'gcloud',
        'run',
        'deploy',
        service,
        `--image=${image}`,
        `--region=${options.region}`,
        `--service-account=${serviceAccount}`,
        '--allow-unauthenticated',
        '--min-instances=0',
        '--max-instances=3',
        '--cpu=1',
        '--memory=512Mi',
        '--concurrency=40',
        '--timeout=60s',
        `--set-env-vars=TELAR_DB_HOST=${options.dbHost},TELAR_DB_SSL=require,SUPABASE_URL=${options.supabaseUrl},LAB_CAPTURE=on`,
        `--set-secrets=${PLATFORM_SECRETS.map((s) => `${s.runEnv}=${s.name}:latest`).join(',')}`,
      ],
    },
  );
  return steps;
}

export function renderPlan(steps: DeployStep[]): string {
  return steps.map((step, i) => {
    const stdin = step.stdinFromEnv ? `  (valor desde $${step.stdinFromEnv} por stdin)` : '';
    return `${String(i + 1).padStart(2, ' ')}. ${step.description}\n    ${step.command.join(' ')}${stdin}`;
  }).join('\n');
}

export const POST_DEPLOY_NOTES = [
  'Después del despliegue, en la base (como administrador):',
  "  insert into private.setting (key, value) values ('drain_url', '<URL de Cloud Run>/internal/drain');",
  "  select vault.create_secret('<mismo valor que TELAR_DRAIN_TOKEN>', 'hilvana_drain_token');",
  "  select cron.schedule('hilvana-drain', '* * * * *', $$select net.http_post(url := (select value from private.setting where key = 'drain_url'), headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hilvana_drain_token')))$$);",
  'Y en Meta: URL de callback <URL de Cloud Run>/webhooks/meta/<id de credencial> con el verify token de esa credencial.',
];

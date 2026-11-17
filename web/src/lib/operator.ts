/**
 * Who runs the site, for the imprint and the privacy notice. The values come from the
 * deployment (astro.config.ts: OPERATOR_NAME, OPERATOR_EMAIL, OPERATOR_ADDRESS), so personal
 * data stays out of the repository. A published site must name its operator: the production
 * build fails without them instead of going live without an imprint. Local and CI builds show
 * a placeholder.
 */

const VARIABLES = ['OPERATOR_NAME', 'OPERATOR_EMAIL', 'OPERATOR_ADDRESS'] as const;

type Variable = (typeof VARIABLES)[number];

export type OperatorEnv = { readonly [name in Variable]?: string | undefined };

export type Operator =
  | { known: true; name: string; email: string; address: string }
  | {
      /** Some value is missing: the pages show a placeholder instead of the operator. */
      known: false;
      name: string | undefined;
      email: string | undefined;
      address: string | undefined;
    };

/** The operator from `env`; throws in a production build that misses a value, naming each. */
export function operatorOrThrow(env: OperatorEnv, isProduction: boolean): Operator {
  // A blank value would publish an empty imprint line, so it counts as missing
  const value = (name: Variable) => env[name]?.trim() || undefined;
  const name = value('OPERATOR_NAME');
  const email = value('OPERATOR_EMAIL');
  const address = value('OPERATOR_ADDRESS');
  if (name && email && address) return { known: true, name, email, address };

  if (isProduction) {
    const missing = VARIABLES.filter((variable) => !value(variable));
    throw new Error(
      `The production build needs ${missing.join(', ')} for the imprint and the privacy ` +
        'notice. Set them as repository variables (Settings > Secrets and variables > ' +
        'Variables); see deploy.yml.',
    );
  }
  return { known: false, name, email, address };
}

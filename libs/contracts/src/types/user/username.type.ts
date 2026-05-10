declare const usernameBrand: unique symbol;

export type Username = string & {
  readonly [usernameBrand]: 'Username';
};
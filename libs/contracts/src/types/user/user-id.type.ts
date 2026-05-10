declare const userIdBrand: unique symbol;

export type UserId = string & {
  readonly [userIdBrand]: 'UserId';
};
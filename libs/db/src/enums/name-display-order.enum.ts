// libs/db/src/enums/name-display-order.enum.ts

/**
 * NameDisplayOrder enum representing user-selectable personal name display order preferences.
 */
export enum NameDisplayOrder {
  Unspecified = 'unspecified',
  Default = 'default',
  LocaleDefault = 'locale_default',
  Auto = 'auto',
  Custom = 'custom',

  DisplayNameOnly = 'display_name_only',
  HandleOnly = 'handle_only',
  UsernameOnly = 'username_only',
  Mononym = 'mononym',

  GivenFamily = 'given_family',
  FamilyGiven = 'family_given',
  FamilyCommaGiven = 'family_comma_given',

  GivenMiddleFamily = 'given_middle_family',
  GivenMiddleInitialFamily = 'given_middle_initial_family',
  GivenFamilyMiddle = 'given_family_middle',
  FamilyGivenMiddle = 'family_given_middle',
  FamilyGivenMiddleInitial = 'family_given_middle_initial',
  FamilyCommaGivenMiddle = 'family_comma_given_middle',
  FamilyCommaGivenMiddleInitial = 'family_comma_given_middle_initial',

  GivenAdditionalFamily = 'given_additional_family',
  FamilyAdditionalGiven = 'family_additional_given',
  GivenFamilyAdditional = 'given_family_additional',
  FamilyGivenAdditional = 'family_given_additional',

  FirstLast = 'first_last',
  LastFirst = 'last_first',
  LastCommaFirst = 'last_comma_first',
  FirstMiddleLast = 'first_middle_last',
  FirstMiddleInitialLast = 'first_middle_initial_last',
  LastFirstMiddle = 'last_first_middle',
  LastFirstMiddleInitial = 'last_first_middle_initial',
  LastCommaFirstMiddle = 'last_comma_first_middle',
  LastCommaFirstMiddleInitial = 'last_comma_first_middle_initial',

  GivenPatronymicFamily = 'given_patronymic_family',
  FamilyGivenPatronymic = 'family_given_patronymic',
  PatronymicGivenFamily = 'patronymic_given_family',
  GivenFamilyPatronymic = 'given_family_patronymic',

  GivenMatronymicFamily = 'given_matronymic_family',
  FamilyGivenMatronymic = 'family_given_matronymic',
  MatronymicGivenFamily = 'matronymic_given_family',
  GivenFamilyMatronymic = 'given_family_matronymic',

  GivenPaternalMaternal = 'given_paternal_maternal',
  GivenMaternalPaternal = 'given_maternal_paternal',
  PaternalMaternalGiven = 'paternal_maternal_given',
  MaternalPaternalGiven = 'maternal_paternal_given',

  GivenFamilyFamily = 'given_family_family',
  FamilyFamilyGiven = 'family_family_given',
  GivenCompoundFamily = 'given_compound_family',
  CompoundFamilyGiven = 'compound_family_given',

  TitleGivenFamily = 'title_given_family',
  TitleFamilyGiven = 'title_family_given',
  GivenFamilySuffix = 'given_family_suffix',
  FamilyGivenSuffix = 'family_given_suffix',
  TitleGivenFamilySuffix = 'title_given_family_suffix',
  TitleFamilyGivenSuffix = 'title_family_given_suffix',

  PreferredGivenFamily = 'preferred_given_family',
  PreferredFamilyGiven = 'preferred_family_given',
  LegalGivenFamily = 'legal_given_family',
  LegalFamilyGiven = 'legal_family_given',
  PublicDisplayName = 'public_display_name',
  PrivateLegalName = 'private_legal_name',
}
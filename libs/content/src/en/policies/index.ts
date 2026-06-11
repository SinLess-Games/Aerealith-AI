import type { PolicyDocument } from '../../types';

import acceptableUsePolicy from './acceptable-use';
import aiTransparencyPolicy from './ai-transparency';
import billingRefundCancellationPolicy from './billing-refund-cancellation';
import cookieTrackingPolicy from './cookie-tracking';
import copyrightTakedownPolicy from './copyright-takedown';
import dataPolicy from './data';
import developerPolicy from './developer';
import incidentNotificationPolicy from './incident-notification';
import paymentProcessorCompliancePolicy from './payment-proccessor-compliance';
import privacyPolicy from './privacy';
import responsibleAiPolicy from './responsible-ai';
import securityPolicy from './security';
import subprocessorVendorListPolicy from './subprocessor-vendor-list';
import supportPolicy from './support';
import termsOfUsePolicy from './terms-of-use';
import underagePolicy from './underage';
import userGeneratedContentPolicy from './user-generated-content';

export {
  acceptableUsePolicy,
  aiTransparencyPolicy,
  billingRefundCancellationPolicy,
  cookieTrackingPolicy,
  copyrightTakedownPolicy,
  dataPolicy,
  developerPolicy,
  incidentNotificationPolicy,
  paymentProcessorCompliancePolicy,
  privacyPolicy,
  responsibleAiPolicy,
  securityPolicy,
  subprocessorVendorListPolicy,
  supportPolicy,
  termsOfUsePolicy,
  underagePolicy,
  userGeneratedContentPolicy
};

export const englishPolicies = [
  termsOfUsePolicy,
  privacyPolicy,
  dataPolicy,
  securityPolicy,
  acceptableUsePolicy,
  aiTransparencyPolicy,
  responsibleAiPolicy,
  cookieTrackingPolicy,
  billingRefundCancellationPolicy,
  paymentProcessorCompliancePolicy,
  copyrightTakedownPolicy,
  incidentNotificationPolicy,
  subprocessorVendorListPolicy,
  supportPolicy,
  underagePolicy,
  userGeneratedContentPolicy,
  developerPolicy,
] satisfies PolicyDocument[];

export const policiesBySlug = englishPolicies.reduce<Record<string, PolicyDocument>>(
  (policies, policy) => {
    policies[policy.slug] = policy;

    return policies;
  },
  {},
);

export const policiesByPath = englishPolicies.reduce<Record<string, PolicyDocument>>(
  (policies, policy) => {
    policies[policy.path] = policy;

    return policies;
  },
  {},
);

export default englishPolicies;

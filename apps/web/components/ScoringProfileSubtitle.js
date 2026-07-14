import { getScoringProfile } from "@catalog-health/core/profiles";

export default function ScoringProfileSubtitle({
  profileId,
  description = false,
  as: Element = "p",
}) {
  const profile = getScoringProfile(profileId);

  return (
    <Element className="profile-subtitle">
      <span className="profile-subtitle-mark" aria-hidden="true" />
      <span>{profile.label} profile</span>
      {description && <span className="profile-subtitle-description">{profile.description}</span>}
    </Element>
  );
}

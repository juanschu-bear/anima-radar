import unittest

from app.pipeline import Channel, PreFilterInput, channel_policy, dedupe_places, pre_filter
from app.providers import PlaceRecord


class PipelineTests(unittest.TestCase):
    def test_canadian_policy_requires_opt_out(self) -> None:
        policy = channel_policy("CA")
        self.assertTrue(policy.requires_opt_out)
        self.assertIn(Channel.business_published_contact, policy.allowed)

    def test_radius_prefilter(self) -> None:
        prospect = PlaceRecord(source="google_places", source_id="1", name="Flower Shop", lat=49.28, lng=-123.12)
        result = pre_filter(PreFilterInput(prospect=prospect, center_lat=49.28, center_lng=-123.12, radius_m=1000))
        self.assertFalse(result.disqualified)

    def test_dedupe_keeps_richer_record(self) -> None:
        sparse = PlaceRecord(source="exa", source_id="a", name="Bloom", website="https://bloom.ca")
        rich = PlaceRecord(source="google_places", source_id="b", name=" Bloom ", website="https://bloom.ca", phone="+1 604 555 0100", rating=4.8)
        result = dedupe_places([sparse, rich])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].source_id, "b")


if __name__ == "__main__":
    unittest.main()

# Prospect enrichment extraction

Return strict JSON only. Extract only evidence present in the website text and reviews. Null is valid for every scalar field; arrays may be empty. Never invent a decision maker, price position, language, or activity date.

Schema: `locations_count`, `products_mentioned[]`, `price_positioning`, `occasions[]`, `current_supplier_hints[]`, `decision_maker_name`, `languages[]`, `instagram_handle`, `complaint_themes[]`, `seasonality_mentions[]`, `last_activity_hint`.

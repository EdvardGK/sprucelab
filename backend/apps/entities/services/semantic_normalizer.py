"""
SemanticTypeNormalizer service for normalizing IFC types to semantic types.

Uses a combination of:
1. IFC class rules (highest confidence)
2. Name pattern matching (medium confidence)

The normalizer applies rules in priority order:
1. Primary IFC class mapping (is_primary=True)
2. Name pattern matching against semantic type patterns
3. Common misuse patterns (lower confidence, requires verification)
"""

import fnmatch
import logging
from typing import Optional, Tuple, Dict, List

from django.db.models import QuerySet

from apps.entities.models import SemanticType, SemanticTypeIFCMapping, TypeBankEntry

logger = logging.getLogger(__name__)


class SemanticTypeNormalizer:
    """Normalizes IFC types to semantic types using rules and patterns."""

    def __init__(self):
        self._rules_cache: Optional[Dict] = None
        self._patterns_cache: Optional[List[Tuple[SemanticType, List[str]]]] = None

    def _load_rules(self) -> Dict[str, List[SemanticTypeIFCMapping]]:
        """Load IFC class rules grouped by ifc_class."""
        rules = {}
        for mapping in SemanticTypeIFCMapping.objects.select_related('semantic_type').all():
            key = mapping.ifc_class
            if key not in rules:
                rules[key] = []
            rules[key].append(mapping)

        # Sort each list: primary first, then by confidence
        for key in rules:
            rules[key].sort(key=lambda m: (-m.is_primary, -m.confidence_hint))

        return rules

    def _load_patterns(self) -> List[Tuple[SemanticType, List[str]]]:
        """Load name patterns for all semantic types."""
        patterns = []
        for st in SemanticType.objects.filter(is_active=True):
            if st.name_patterns:
                patterns.append((st, st.name_patterns))
        return patterns

    @property
    def rules(self) -> Dict[str, List[SemanticTypeIFCMapping]]:
        """Cached IFC class rules."""
        if self._rules_cache is None:
            self._rules_cache = self._load_rules()
        return self._rules_cache

    @property
    def patterns(self) -> List[Tuple[SemanticType, List[str]]]:
        """Cached name patterns."""
        if self._patterns_cache is None:
            self._patterns_cache = self._load_patterns()
        return self._patterns_cache

    def clear_cache(self):
        """Clear cached rules and patterns (call after data changes)."""
        self._rules_cache = None
        self._patterns_cache = None

    def normalize(
        self,
        type_bank_entry: TypeBankEntry
    ) -> Optional[Tuple[SemanticType, str, float]]:
        """
        Attempt to normalize a TypeBankEntry to a SemanticType.

        Returns:
            Tuple of (semantic_type, source, confidence) or None if no match found.

            source values:
            - 'auto_rule': Matched by IFC class rule
            - 'auto_pattern': Matched by name pattern

            confidence: 0.0-1.0, higher is more certain
        """
        # 1. Try primary IFC class rules first (highest confidence)
        rule_result = self._match_by_ifc_class(type_bank_entry, primary_only=True)
        if rule_result and rule_result[2] >= 0.8:
            return rule_result

        # 2. Try name pattern matching
        pattern_result = self._match_by_name_pattern(type_bank_entry)

        # 3. If pattern match found with good confidence, use it
        if pattern_result and pattern_result[2] >= 0.7:
            return pattern_result

        # 4. Try all IFC class rules (including misuse patterns)
        if not rule_result:
            rule_result = self._match_by_ifc_class(type_bank_entry, primary_only=False)

        # 5. Return best result
        if rule_result and pattern_result:
            # Return the higher confidence match
            return rule_result if rule_result[2] >= pattern_result[2] else pattern_result
        return rule_result or pattern_result

    def _normalize_ifc_class(self, ifc_class: str) -> str:
        """
        Normalize IFC class name by removing 'Type' suffix.

        TypeBankEntry stores type objects (IfcBeamType, IfcWallType),
        but our mappings use element classes (IfcBeam, IfcWall).
        """
        if ifc_class and ifc_class.endswith('Type'):
            return ifc_class[:-4]  # Remove 'Type' suffix
        return ifc_class

    def _match_by_ifc_class(
        self,
        entry: TypeBankEntry,
        primary_only: bool = False
    ) -> Optional[Tuple[SemanticType, str, float]]:
        """
        Match based on IFC class and predefined type.

        Args:
            entry: TypeBankEntry to match
            primary_only: If True, only consider primary mappings

        Returns:
            (semantic_type, 'auto_rule', confidence) or None
        """
        ifc_class = entry.ifc_class
        if not ifc_class:
            return None

        # Try direct match first, then normalized (without 'Type' suffix)
        mappings = self.rules.get(ifc_class, [])
        if not mappings:
            normalized_class = self._normalize_ifc_class(ifc_class)
            if normalized_class != ifc_class:
                mappings = self.rules.get(normalized_class, [])

        if not mappings:
            return None

        # Try to match predefined_type first
        predefined = entry.predefined_type or ''
        for mapping in mappings:
            if primary_only and not mapping.is_primary:
                continue

            # Check predefined_type match
            if mapping.predefined_type:
                if mapping.predefined_type.lower() == predefined.lower():
                    return (mapping.semantic_type, 'auto_rule', mapping.confidence_hint)
            elif mapping.is_primary:
                # Primary mapping without predefined_type
                return (mapping.semantic_type, 'auto_rule', mapping.confidence_hint)

        # If no exact match, try first primary mapping
        if not primary_only:
            for mapping in mappings:
                if not mapping.predefined_type:
                    return (mapping.semantic_type, 'auto_rule', mapping.confidence_hint)

        return None

    def _match_by_name_pattern(
        self,
        entry: TypeBankEntry
    ) -> Optional[Tuple[SemanticType, str, float]]:
        """
        Match based on type name patterns.

        Uses fnmatch for glob-style pattern matching (*, ?, []).

        Returns:
            (semantic_type, 'auto_pattern', confidence) or None
        """
        type_name = entry.type_name or ''
        if not type_name:
            return None

        name_lower = type_name.lower()

        # Also check canonical_name if available
        canonical = entry.canonical_name or ''
        canonical_lower = canonical.lower()

        for semantic_type, type_patterns in self.patterns:
            for pattern in type_patterns:
                pattern_lower = pattern.lower()
                if fnmatch.fnmatch(name_lower, pattern_lower):
                    # Pattern match - base confidence 0.7
                    confidence = 0.7
                    return (semantic_type, 'auto_pattern', confidence)
                if canonical_lower and fnmatch.fnmatch(canonical_lower, pattern_lower):
                    # Canonical name match - slightly lower confidence
                    confidence = 0.65
                    return (semantic_type, 'auto_pattern', confidence)

        return None

    def bulk_normalize(
        self,
        queryset: QuerySet,
        overwrite: bool = False
    ) -> Dict[str, int]:
        """
        Bulk normalize multiple TypeBankEntries.

        Args:
            queryset: QuerySet of TypeBankEntry objects
            overwrite: If True, overwrite existing semantic_type assignments

        Returns:
            Dict with stats: {'normalized': n, 'skipped': n, 'failed': n}
        """
        stats = {'normalized': 0, 'skipped': 0, 'failed': 0}

        # Filter based on overwrite setting
        if not overwrite:
            queryset = queryset.filter(semantic_type__isnull=True)

        # Process in batches
        entries_to_update = []
        for entry in queryset.iterator(chunk_size=100):
            result = self.normalize(entry)
            if result:
                semantic_type, source, confidence = result
                entry.semantic_type = semantic_type
                entry.semantic_type_source = source
                entry.semantic_type_confidence = confidence
                entries_to_update.append(entry)
                stats['normalized'] += 1

                # Batch update every 100 entries
                if len(entries_to_update) >= 100:
                    TypeBankEntry.objects.bulk_update(
                        entries_to_update,
                        ['semantic_type', 'semantic_type_source', 'semantic_type_confidence']
                    )
                    entries_to_update = []
            else:
                stats['skipped'] += 1

        # Update remaining entries
        if entries_to_update:
            TypeBankEntry.objects.bulk_update(
                entries_to_update,
                ['semantic_type', 'semantic_type_source', 'semantic_type_confidence']
            )

        return stats

    def suggest_semantic_type(
        self,
        ifc_class: str,
        type_name: str,
        predefined_type: str = ''
    ) -> List[Dict]:
        """
        Suggest possible semantic types for given IFC metadata.

        Returns list of suggestions with confidence scores, sorted by confidence.

        Useful for API endpoint to show suggestions before user confirms.
        """
        suggestions = []

        # Create a mock entry for matching
        class MockEntry:
            pass

        mock = MockEntry()
        mock.ifc_class = ifc_class
        mock.type_name = type_name
        mock.predefined_type = predefined_type
        mock.canonical_name = ''

        # Get all possible matches
        seen_codes = set()

        # IFC class rules (try both direct and normalized)
        mappings = self.rules.get(ifc_class, [])
        if not mappings:
            normalized_class = self._normalize_ifc_class(ifc_class)
            if normalized_class != ifc_class:
                mappings = self.rules.get(normalized_class, [])
        for mapping in mappings:
            if mapping.semantic_type.code not in seen_codes:
                suggestions.append({
                    'semantic_type': mapping.semantic_type,
                    'code': mapping.semantic_type.code,
                    'name_en': mapping.semantic_type.name_en,
                    'source': 'ifc_rule',
                    'confidence': mapping.confidence_hint,
                    'is_primary': mapping.is_primary,
                    'is_common_misuse': mapping.is_common_misuse,
                    'note': mapping.note,
                })
                seen_codes.add(mapping.semantic_type.code)

        # Name patterns
        pattern_result = self._match_by_name_pattern(mock)
        if pattern_result and pattern_result[0].code not in seen_codes:
            st = pattern_result[0]
            suggestions.append({
                'semantic_type': st,
                'code': st.code,
                'name_en': st.name_en,
                'source': 'name_pattern',
                'confidence': pattern_result[2],
                'is_primary': False,
                'is_common_misuse': False,
                'note': f'Matched pattern in type name',
            })

        # Sort by confidence (descending)
        suggestions.sort(key=lambda x: -x['confidence'])

        return suggestions


# Singleton instance for convenience
_normalizer_instance: Optional[SemanticTypeNormalizer] = None


def get_normalizer() -> SemanticTypeNormalizer:
    """Get or create the singleton normalizer instance."""
    global _normalizer_instance
    if _normalizer_instance is None:
        _normalizer_instance = SemanticTypeNormalizer()
    return _normalizer_instance


def clear_normalizer_cache():
    """Clear the singleton normalizer cache."""
    global _normalizer_instance
    if _normalizer_instance is not None:
        _normalizer_instance.clear_cache()

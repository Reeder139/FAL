import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Radii, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchVenues, type Venue } from '@/lib/venues';

export interface VenueSelection {
  venueId: string | null;
  venueName: string;
  isNew: boolean;
}

type VenuePickerProps = {
  selection: VenueSelection | null;
  onChange: (selection: VenueSelection | null) => void;
  venueHidden: boolean;
  onChangeVenueHidden: (hidden: boolean) => void;
};

export function VenuePicker({ selection, onChange, venueHidden, onChangeVenueHidden }: VenuePickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState(selection?.venueName ?? '');
  const [results, setResults] = useState<Venue[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (selection || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        setResults(await searchVenues(query));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, selection]);

  const handleSelectResult = (venue: Venue) => {
    onChange({ venueId: venue.id, venueName: venue.name, isNew: false });
    setQuery(venue.name);
    setFocused(false);
  };

  const handleAddNew = () => {
    onChange({ venueId: null, venueName: query.trim(), isNew: true });
    setFocused(false);
  };

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (selection) onChange(null);
  };

  const showDropdown = focused && !selection && query.trim().length >= 2;

  return (
    <View style={styles.container}>
      <FormField
        label="Venue"
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search for a venue"
        labelAccessory={
          selection?.isNew ? (
            <Text style={[Typography.caption, { color: theme.success }]}>New venue</Text>
          ) : searching ? (
            <Text style={[Typography.caption, { color: theme.textMuted }]}>Searching…</Text>
          ) : null
        }
      />

      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          {results.map((venue) => (
            <Pressable key={venue.id} onPress={() => handleSelectResult(venue)} style={styles.dropdownRow}>
              <Text style={[Typography.body, { color: theme.text }]}>{venue.name}</Text>
              {venue.county && (
                <Text style={[Typography.caption, { color: theme.textMuted }]}>{venue.county}</Text>
              )}
            </Pressable>
          ))}
          <Pressable onPress={handleAddNew} style={styles.dropdownRow}>
            <Text style={[Typography.body, { color: theme.primary }]}>Add “{query.trim()}” as a new venue</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.toggleRow}>
        <Text style={[Typography.body, { color: theme.text }]}>Hide venue publicly</Text>
        <Switch value={venueHidden} onValueChange={onChangeVenueHidden} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  dropdownRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

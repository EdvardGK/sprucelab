import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useSemanticTypesByCategory,
  useSemanticTypeSuggestions,
  useSetSemanticType,
  useVerifySemanticType,
  type SemanticType,
  type SemanticTypeCategory,
  type SemanticTypeSuggestion,
} from '@/hooks/use-warehouse';
import { SemanticTypePill } from './SemanticTypeBadge';

// Category colors (matching SemanticTypeBadge)
const CATEGORY_COLORS: Record<SemanticTypeCategory, string> = {
  'A-Structural': 'text-blue-600 dark:text-blue-400',
  'D-Openings': 'text-amber-600 dark:text-amber-400',
  'E-Cladding': 'text-emerald-600 dark:text-emerald-400',
  'F-MEP': 'text-purple-600 dark:text-purple-400',
  'Z-Generic': 'text-gray-600 dark:text-gray-400',
};

interface SemanticTypeSelectorProps {
  entryId: string;
  currentCode: string | null;
  currentName: string | null;
  currentCategory: SemanticTypeCategory | null;
  currentSource: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  currentConfidence: number | null;
  ifcClass: string;
  onSuccess?: () => void;
  className?: string;
}

export function SemanticTypeSelector({
  entryId,
  currentCode,
  currentName: _currentName, // Reserved for future tooltip
  currentCategory,
  currentSource,
  currentConfidence,
  ifcClass: _ifcClass, // Reserved for future filtering
  onSuccess,
  className,
}: SemanticTypeSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Fetch all semantic types grouped by category
  const { data: typesByCategory } = useSemanticTypesByCategory();

  // Fetch suggestions for this entry
  const { data: suggestions } = useSemanticTypeSuggestions(entryId, {
    enabled: open,
  });

  // Mutations
  const setSemanticType = useSetSemanticType();
  const verifySemanticType = useVerifySemanticType();

  const isVerified = currentSource === 'verified';
  const isAuto = currentSource === 'auto_ifc_class' || currentSource === 'auto_name_pattern';
  const canVerify = currentCode && !isVerified;

  const handleSelect = async (code: string) => {
    try {
      await setSemanticType.mutateAsync({
        entryId,
        semanticTypeCode: code,
      });
      setOpen(false);
      onSuccess?.();
    } catch {
      // Error handling is done by the mutation
    }
  };

  const handleVerify = async () => {
    try {
      await verifySemanticType.mutateAsync(entryId);
      onSuccess?.();
    } catch {
      // Error handling is done by the mutation
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 justify-between min-w-[180px]"
          >
            {currentCode ? (
              <SemanticTypePill
                code={currentCode}
                category={currentCategory}
                source={currentSource}
              />
            ) : (
              <span className="text-muted-foreground text-sm">
                {t('semanticTypes.selectType')}
              </span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('common.search')} className="h-9" />
            <CommandList>
              <CommandEmpty>{t('common.loading')}</CommandEmpty>

              {/* Suggestions section */}
              {suggestions && suggestions.length > 0 && (
                <>
                  <CommandGroup heading={t('semanticTypes.suggestions')}>
                    {suggestions.map((suggestion) => (
                      <SuggestionItem
                        key={suggestion.code}
                        suggestion={suggestion}
                        isSelected={currentCode === suggestion.code}
                        onSelect={() => handleSelect(suggestion.code)}
                      />
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* All types by category */}
              {typesByCategory &&
                Object.entries(typesByCategory).map(([category, types]) => (
                  <CommandGroup
                    key={category}
                    heading={t(`semanticTypes.categories.${category as SemanticTypeCategory}`)}
                  >
                    {types.map((type: SemanticType) => (
                      <CommandItem
                        key={type.code}
                        value={`${type.code} ${type.name_en} ${type.name_no}`}
                        onSelect={() => handleSelect(type.code)}
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            'h-4 w-4',
                            currentCode === type.code ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className={cn('font-medium', CATEGORY_COLORS[category as SemanticTypeCategory])}>
                          {type.code}
                        </span>
                        <span className="flex-1 truncate">{type.name_en}</span>
                        {type.type_bank_entry_count > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {type.type_bank_entry_count}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Verify button for auto-assigned types */}
      {canVerify && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleVerify}
          disabled={verifySemanticType.isPending}
          className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {t('semanticTypes.verify')}
        </Button>
      )}

      {/* Verified indicator */}
      {isVerified && (
        <Badge variant="outline" className="h-6 gap-1 text-green-600 border-green-300 bg-green-50">
          <CheckCircle2 className="h-3 w-3" />
          {t('semanticTypes.verified')}
        </Badge>
      )}

      {/* Confidence indicator for auto-assigned */}
      {isAuto && currentConfidence !== null && (
        <span className="text-xs text-muted-foreground">
          {Math.round(currentConfidence * 100)}%
        </span>
      )}
    </div>
  );
}

/**
 * Suggestion item with confidence and source info.
 */
function SuggestionItem({
  suggestion,
  isSelected,
  onSelect,
}: {
  suggestion: SemanticTypeSuggestion;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <CommandItem
      value={`${suggestion.code} ${suggestion.name_en}`}
      onSelect={onSelect}
      className="flex items-center gap-2"
    >
      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
      <span className="font-medium">{suggestion.code}</span>
      <span className="flex-1 truncate">{suggestion.name_en}</span>
      <div className="flex items-center gap-1.5">
        {suggestion.is_primary && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
            {t('semanticTypes.source')}: {suggestion.source.replace('_', ' ')}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {Math.round(suggestion.confidence * 100)}%
        </span>
        {suggestion.is_common_misuse && (
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
        )}
      </div>
    </CommandItem>
  );
}

/**
 * Compact inline selector for table cells.
 */
export function SemanticTypeCellSelector({
  entryId,
  currentCode,
  currentCategory,
  currentSource,
  ifcClass: _ifcClass, // Reserved for future filtering
  onSuccess,
}: {
  entryId: string;
  currentCode: string | null;
  currentCategory: SemanticTypeCategory | null;
  currentSource: 'auto_ifc_class' | 'auto_name_pattern' | 'manual' | 'verified' | null;
  ifcClass: string;
  onSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: typesByCategory } = useSemanticTypesByCategory();
  const setSemanticType = useSetSemanticType();

  const handleSelect = async (code: string) => {
    try {
      await setSemanticType.mutateAsync({
        entryId,
        semanticTypeCode: code,
      });
      setOpen(false);
      onSuccess?.();
    } catch {
      // Error handling
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full text-left hover:bg-accent/50 px-2 py-1 rounded transition-colors">
          <SemanticTypePill
            code={currentCode}
            category={currentCategory}
            source={currentSource}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('common.search')} className="h-9" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{t('common.loading')}</CommandEmpty>
            {typesByCategory &&
              Object.entries(typesByCategory).map(([category, types]) => (
                <CommandGroup
                  key={category}
                  heading={t(`semanticTypes.categories.${category as SemanticTypeCategory}`)}
                >
                  {types.map((type: SemanticType) => (
                    <CommandItem
                      key={type.code}
                      value={`${type.code} ${type.name_en}`}
                      onSelect={() => handleSelect(type.code)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5',
                          currentCode === type.code ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className={cn('font-medium', CATEGORY_COLORS[category as SemanticTypeCategory])}>
                        {type.code}
                      </span>
                      <span className="flex-1 truncate text-xs">{type.name_en}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SemanticTypeSelector;

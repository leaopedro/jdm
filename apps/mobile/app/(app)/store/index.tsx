import type {
  StoreCollection,
  StoreProductSummary,
  StoreProductType,
  StoreProductVariant,
} from '@jdm/shared/store';
import { Badge, Button, Text } from '@jdm/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { ShoppingCart } from 'lucide-react-native';
import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  getStoreProduct,
  listStoreCollections,
  listStoreProducts,
  listStoreProductTypes,
} from '~/api/store';
import { useCart } from '~/cart/context';
import { getCartAddErrorMessage } from '~/cart/error-message';
import { cartCopy } from '~/copy/cart';
import { storeCopy } from '~/copy/store';
import { showMessage } from '~/lib/confirm';
import { formatBRL } from '~/lib/format';
import { theme } from '~/theme';

const BRAND_RED = '#E10600';

const pickVariantForPurchase = (variants: StoreProductVariant[]): StoreProductVariant | null => {
  return variants.find((variant) => variant.isActive && variant.stockOnHand > 0) ?? null;
};

const formatPriceRange = (product: StoreProductSummary): string => {
  const { minPriceCents, maxPriceCents } = product.priceRange;
  if (minPriceCents === maxPriceCents) return formatBRL(minPriceCents);
  return `${formatBRL(minPriceCents)} - ${formatBRL(maxPriceCents)}`;
};

export default function StoreIndex() {
  const router = useRouter();
  const { addItem, adding, itemCount } = useCart();
  const [search, setSearch] = useState('');
  const [collections, setCollections] = useState<StoreCollection[]>([]);
  const [productTypes, setProductTypes] = useState<StoreProductType[]>([]);
  const [items, setItems] = useState<StoreProductSummary[] | null>(null);
  const [collectionSlug, setCollectionSlug] = useState<string | null>(null);
  const [productTypeSlug, setProductTypeSlug] = useState<string | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const searchQuery = useDeferredValue(search.trim());
  const hasMountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadFilters = useCallback(async () => {
    setLoadingFilters(true);
    try {
      const [nextCollections, nextProductTypes] = await Promise.all([
        listStoreCollections(),
        listStoreProductTypes(),
      ]);
      setCollections(nextCollections.items);
      setProductTypes(nextProductTypes.items);
    } finally {
      setLoadingFilters(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoadingProducts(true);
    setError(false);
    try {
      const response = await listStoreProducts({
        q: searchQuery.length > 0 ? searchQuery : undefined,
        collectionSlug: collectionSlug ?? undefined,
        productTypeSlug: productTypeSlug ?? undefined,
      });
      if (requestId !== requestIdRef.current) return;
      setItems(response.items);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingProducts(false);
      }
    }
  }, [collectionSlug, productTypeSlug, searchQuery]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }

      void loadFilters();
      void loadProducts();
    }, [loadFilters, loadProducts]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFilters(), loadProducts()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadFilters, loadProducts]);

  const onAddToCart = useCallback(
    async (product: StoreProductSummary) => {
      if (adding || pendingProductId) return;
      setPendingProductId(product.id);
      try {
        const detail = await getStoreProduct(product.slug);
        const variant = pickVariantForPurchase(detail.product.variants);
        if (!variant) {
          showMessage(cartCopy.errors.variantSoldOut);
          return;
        }

        await addItem({
          variantId: variant.id,
          source: 'purchase',
          kind: 'product',
          quantity: 1,
          tickets: [],
          metadata: { source: 'mobile' },
        });
        showMessage(storeCopy.actions.added);
      } catch (error: unknown) {
        showMessage(getCartAddErrorMessage(error));
      } finally {
        setPendingProductId(null);
      }
    },
    [addItem, adding, pendingProductId],
  );

  const renderHero = () => (
    <View style={styles.headerWrap}>
      <LinearGradient colors={['#2D0603', '#130D0D', '#0B0B0F']} style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text variant="eyebrow" tone="brand">
            {storeCopy.header.eyebrow}
          </Text>
          <Text variant="h1" className="mt-2">
            {storeCopy.header.title}
          </Text>
          <Text variant="body" tone="secondary" className="mt-3">
            {storeCopy.header.subtitle}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/cart' as never)}
          accessibilityRole="button"
          accessibilityLabel={`${storeCopy.actions.openCart}, ${itemCount} itens`}
          hitSlop={8}
          style={styles.cartButton}
        >
          <ShoppingCart color="#F5F5F5" size={22} strokeWidth={1.75} />
          {itemCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCopy.badge(itemCount)}</Text>
            </View>
          ) : null}
        </Pressable>
      </LinearGradient>
    </View>
  );

  const listHeader = (
    <View>
      {renderHero()}
      <SearchInput value={search} onChangeText={setSearch} />
      <FilterRow
        label={storeCopy.filters.productTypes}
        loading={loadingFilters}
        allLabel={storeCopy.filters.allProductTypes}
        selectedSlug={productTypeSlug}
        items={productTypes.map((item) => ({ slug: item.slug, label: item.name }))}
        onSelect={(slug) => startTransition(() => setProductTypeSlug(slug))}
      />
      <FilterRow
        label={storeCopy.filters.collections}
        loading={loadingFilters}
        allLabel={storeCopy.filters.allCollections}
        selectedSlug={collectionSlug}
        items={collections.map((item) => ({ slug: item.slug, label: item.title }))}
        onSelect={(slug) => startTransition(() => setCollectionSlug(slug))}
      />
      <View style={styles.summaryRow}>
        <Text variant="bodySm" tone="muted">
          {storeCopy.summary.itemCount(items?.length ?? 0)}
        </Text>
      </View>
    </View>
  );

  if (loadingProducts && items === null) {
    return (
      <View style={styles.center}>
        {listHeader}
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={BRAND_RED} />
          <Text variant="bodySm" tone="secondary" className="mt-3">
            {storeCopy.states.loading}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.container}>
          {listHeader}
          <View style={styles.emptyState}>
            <Text variant="h3">{storeCopy.states.error}</Text>
            <Button
              label={storeCopy.actions.retry}
              onPress={() => {
                void loadProducts();
              }}
              className="mt-4"
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="h3">{storeCopy.states.empty}</Text>
              <Text variant="body" tone="secondary" className="mt-2">
                {storeCopy.states.emptyHint}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
              tintColor={BRAND_RED}
              colors={[BRAND_RED]}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              adding={pendingProductId === item.id}
              onAdd={() => {
                void onAddToCart(item);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function SearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.searchBlock}>
      <Text variant="caption" tone="secondary" className="mb-2">
        {storeCopy.search.label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={storeCopy.search.placeholder}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={storeCopy.search.label}
        style={styles.searchInput}
      />
    </View>
  );
}

function FilterRow({
  label,
  loading,
  allLabel,
  selectedSlug,
  items,
  onSelect,
}: {
  label: string;
  loading: boolean;
  allLabel: string;
  selectedSlug: string | null;
  items: { slug: string; label: string }[];
  onSelect: (slug: string | null) => void;
}) {
  return (
    <View style={styles.filterSection}>
      <Text variant="caption" tone="secondary" className="mb-2">
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip active={selectedSlug === null} label={allLabel} onPress={() => onSelect(null)} />
        {items.map((item) => (
          <Chip
            key={item.slug}
            active={selectedSlug === item.slug}
            label={item.label}
            onPress={() => onSelect(item.slug)}
          />
        ))}
        {loading ? (
          <View style={styles.chipLoading}>
            <ActivityIndicator color={BRAND_RED} size="small" />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text
        variant="bodySm"
        weight={active ? 'bold' : 'medium'}
        tone={active ? 'inverse' : 'secondary'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({
  product,
  adding,
  onAdd,
}: {
  product: StoreProductSummary;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <View style={styles.card}>
      {product.coverImageUrl ? (
        <Image
          source={{ uri: product.coverImageUrl }}
          style={styles.cardImage}
          accessible={false}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardMeta}>
          <Badge
            label={product.requiresShipping ? storeCopy.badges.shipping : storeCopy.badges.pickup}
            tone="neutral"
            size="sm"
          />
          <Text variant="caption" tone="muted">
            {product.productType.name}
          </Text>
        </View>
        <Text variant="body" weight="bold" numberOfLines={2}>
          {product.title}
        </Text>
        {product.shortDescription ? (
          <Text variant="bodySm" tone="secondary" numberOfLines={2} className="mt-1">
            {product.shortDescription}
          </Text>
        ) : null}
        <Text variant="bodyLg" weight="bold" className="mt-3">
          {formatPriceRange(product)}
        </Text>
        <Button
          label={
            !product.inStock
              ? storeCopy.actions.soldOut
              : adding
                ? storeCopy.actions.adding
                : storeCopy.actions.add
          }
          onPress={onAdd}
          disabled={!product.inStock || adding}
          loading={adding}
          size="sm"
          className="mt-4"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  headerWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  hero: {
    borderRadius: 20,
    padding: theme.spacing.xl,
    minHeight: 196,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroCopy: {
    maxWidth: '82%',
  },
  cartButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: BRAND_RED,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  searchBlock: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  searchInput: {
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#26262D',
    backgroundColor: '#111116',
    color: theme.colors.fg,
    fontFamily: 'Inter_400Regular',
    fontSize: theme.font.size.lg,
  },
  filterSection: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  chipRow: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A2A33',
    backgroundColor: '#111116',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: BRAND_RED,
    backgroundColor: BRAND_RED,
  },
  chipLoading: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  summaryRow: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  listContent: {
    paddingBottom: 120,
  },
  gridRow: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  card: {
    flex: 1,
    maxWidth: '48%',
    backgroundColor: '#111116',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1B1B22',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1A1A20',
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: theme.spacing.md,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: 56,
  },
  loadingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 56,
  },
});

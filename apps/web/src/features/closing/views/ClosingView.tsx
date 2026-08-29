"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { listListings } from "@/features/listings/resources/listings";
import { ClosingSection } from "./ClosingSection";

export function ClosingView() {
  const listings = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings });
  return <AppShell><header className="page-header"><p className="eyebrow">PAZARLAMA VE KAPAMA</p><h1>Sunumlar ve işlemler</h1><p className="context-sentence">Portföy sunumlarını, gösterimleri, teklifleri, sözleşmeleri ve kapanan işlemleri burada takip et.</p></header>{listings.isPending ? <div className="content-state">Portföyler hazırlanıyor…</div> : listings.error ? <p className="form-error notice">Portföyler yüklenemedi.</p> : listings.data?.length ? <ClosingSection listings={listings.data} showHeading={false} /> : <SpCard className="empty-state"><h2>Önce bir portföy ekle</h2><p>Mevcut yetkini doğrudan ekleyebilir veya kazanılan fırsatı portföye dönüştürebilirsin.</p><Link className="primary-action inline-link" href="/listings">Portföye git</Link></SpCard>}</AppShell>;
}

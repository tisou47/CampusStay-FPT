import { useEffect, useState } from 'react'
import { Check, Package } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Note } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { typeName } from '@/lib/furniture'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// Admin › Furniture types › Prices: what each furniture type costs to replace in each Room Class (VND). Check-out
// charges a student price × (percent of the condition at check-out − percent at check-in); the percentages are
// System parameters › Room handover.
// GET /admin/furniture-prices → { types: [{ id, name, nameVi }], roomClasses: [{ id, name }], items: [{ typeId, roomClassId, price }] }
// PUT /admin/furniture-prices { items: [{ typeId, roomClassId, price }] }

const key = (typeId, classId) => `${typeId}/${classId}`
const digits = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

export default function FurniturePrices() {
  const { notify, notifyError } = useToast()
  const query = useQuery(['admin-furniture-prices'], ({ signal }) => api.admin.furniturePrices.list(undefined, { signal }))
  const [prices, setPrices] = useState({})
  useEffect(() => {
    if (query.data) setPrices(Object.fromEntries(query.data.items.map((p) => [key(p.typeId, p.roomClassId), formatNumber(p.price)])))
  }, [query.data])
  const save = useMutation(
    () =>
      api.admin.furniturePrices.save({
        items: Object.entries(prices).map(([k, v]) => {
          const [typeId, roomClassId] = k.split('/')
          return { typeId, roomClassId, price: digits(v) }
        }),
      }),
    {
      invalidates: ['admin-furniture-prices'],
      onSuccess: () => notify({ title: 'Prices saved', message: 'Check-outs from now on use them.' }),
      onError: (e) => notifyError(e, 'Could not save the prices'),
    },
  )
  const types = query.data?.types ?? []
  const classes = query.data?.roomClasses ?? []
  return (
    <>
      <PageHeader
        title="Furniture prices"
        description="What each furniture type costs to replace, by room tier. A damaged or missing item is charged a percent of this price at check-out."
        breadcrumb={[{ label: 'Furniture types', to: '/admin/furniture-types' }, { label: 'Prices' }]}
        actions={
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!query.data || save.pending}>
            Save prices
          </Button>
        }
      />
      <Note>{t('The charge percentages (Worn, Damaged, Missing) are in System parameters › Room handover.')}</Note>
      <Table fill>
        <THead>
          <tr>
            <Th>Furniture type</Th>
            {classes.map((c) => (
              <Th key={c.id} className="w-44" align="right">
                {tr(c.name)} (₫)
              </Th>
            ))}
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={classes.length + 1} rows={types} emptyIcon={Package} emptyTitle="No furniture types yet" />
          {types.map((ft) => (
            <Tr key={ft.id}>
              <Td>{typeName(ft)}</Td>
              {classes.map((c) => (
                <Td key={c.id} align="right">
                  <Input
                    aria-label={t('Price of {type} in {tier}', { type: typeName(ft), tier: tr(c.name) })}
                    inputMode="numeric"
                    className="text-right tabular"
                    value={prices[key(ft.id, c.id)] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [key(ft.id, c.id)]: e.target.value }))}
                    onBlur={(e) => setPrices((p) => ({ ...p, [key(ft.id, c.id)]: formatNumber(digits(e.target.value)) }))}
                  />
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </>
  )
}

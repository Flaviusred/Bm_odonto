import React, { useState } from 'react';
import { InventoryItem, InventoryMovement, User } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { Package, Plus, Search, AlertTriangle, Trash2, Edit2, ArrowUpRight, ArrowDownLeft, History, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  movements: InventoryMovement[];
  user: User;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onDeleteInventoryItem: (id: string) => void;
  onAddMovement: (movement: InventoryMovement) => void;
}

export function InventoryManager({ inventory, movements, user, onUpdateInventory, onDeleteInventoryItem, onAddMovement }: InventoryManagerProps) {
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItemForMovement, setSelectedItemForMovement] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<'in' | 'out'>('in');
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    name: '',
    quantity: 0,
    minQuantity: 0,
    unit: '',
    category: '',
  });

  const [movementData, setMovementData] = useState({
    quantity: 1,
    reason: '',
  });

  const [showItemConfirm, setShowItemConfirm] = useState(false);
  const [showMovementConfirm, setShowMovementConfirm] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMovements = movements.filter(m => 
    m.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.userName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.length < 2) newErrors.name = 'Nome deve ter pelo menos 2 caracteres';
    if (formData.category.length < 2) newErrors.category = 'Categoria inválida';
    if (formData.unit.length < 1) newErrors.unit = 'Unidade é obrigatória';
    if (formData.quantity < 0) newErrors.quantity = 'Quantidade não pode ser negativa';
    if (formData.minQuantity < 0) newErrors.minQuantity = 'Quantidade mínima não pode ser negativa';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setShowItemConfirm(true);
  };

  const confirmItemSave = () => {
    if (editingItem) {
      const updated = inventory.map(item => 
        item.id === editingItem.id 
          ? { ...item, ...formData, lastUpdated: new Date().toISOString() } 
          : item
      );
      onUpdateInventory(updated);
    } else {
      const newItem: InventoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        ...formData,
        lastUpdated: new Date().toISOString(),
      };
      onUpdateInventory([...inventory, newItem]);
    }
    setIsModalOpen(false);
    setShowItemConfirm(false);
    setEditingItem(null);
    setFormData({ name: '', quantity: 0, minQuantity: 0, unit: '', category: '' });
    setErrors({});
  };

  const handleMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForMovement) return;

    if (movementType === 'out' && selectedItemForMovement.quantity < movementData.quantity) {
      alert('Quantidade insuficiente em estoque!');
      return;
    }
    setShowMovementConfirm(true);
  };

  const confirmMovementSave = () => {
    if (!selectedItemForMovement) return;

    const newMovement: InventoryMovement = {
      id: Math.random().toString(36).substr(2, 9),
      itemId: selectedItemForMovement.id,
      itemName: selectedItemForMovement.name,
      type: movementType,
      quantity: movementData.quantity,
      reason: movementData.reason,
      date: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
    };

    const updatedInventory = inventory.map(item => {
      if (item.id === selectedItemForMovement.id) {
        const newQuantity = movementType === 'in' 
          ? item.quantity + movementData.quantity 
          : item.quantity - movementData.quantity;
        return { ...item, quantity: newQuantity, lastUpdated: new Date().toISOString() };
      }
      return item;
    });

    onUpdateInventory(updatedInventory);
    onAddMovement(newMovement);
    setIsMovementModalOpen(false);
    setShowMovementConfirm(false);
    setSelectedItemForMovement(null);
    setMovementData({ quantity: 1, reason: '' });
  };

  const handleDelete = (id: string) => {
    setDeletingItemId(id);
  };

  const confirmDelete = () => {
    if (deletingItemId) {
      onDeleteInventoryItem(deletingItemId);
    }
    setDeletingItemId(null);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      unit: item.unit,
      category: item.category,
    });
    setIsModalOpen(true);
  };

  const handleOpenMovement = (item: InventoryItem, type: 'in' | 'out') => {
    setSelectedItemForMovement(item);
    setMovementType(type);
    setMovementData({ quantity: 1, reason: '' });
    setIsMovementModalOpen(true);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestão de Estoque</h1>
          <p className="text-zinc-500">Controle de entradas, saídas e níveis de materiais</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'stock' ? 'default' : 'outline'}
            onClick={() => setActiveTab('stock')}
            className="gap-2"
          >
            <Package className="h-4 w-4" />
            Estoque
          </Button>
          <Button 
            variant={activeTab === 'movements' ? 'default' : 'outline'}
            onClick={() => setActiveTab('movements')}
            className="gap-2"
          >
            <History className="h-4 w-4" />
            Histórico
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-none shadow-sm bg-emerald-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-600">Total de Itens</p>
                <p className="text-2xl font-bold text-emerald-900">{inventory.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-amber-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500 flex items-center justify-center text-white">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-600">Estoque Baixo</p>
                <p className="text-2xl font-bold text-amber-900">
                  {inventory.filter(item => item.quantity <= item.minQuantity).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                <ArrowUpRight className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-600">Entradas (Mês)</p>
                <p className="text-2xl font-bold text-blue-900">
                  {movements.filter(m => m.type === 'in' && new Date(m.date).getMonth() === new Date().getMonth()).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-rose-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-rose-500 flex items-center justify-center text-white">
                <ArrowDownLeft className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-rose-600">Saídas (Mês)</p>
                <p className="text-2xl font-bold text-rose-900">
                  {movements.filter(m => m.type === 'out' && new Date(m.date).getMonth() === new Date().getMonth()).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50 flex flex-row items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input 
              placeholder={activeTab === 'stock' ? "Buscar por nome ou categoria..." : "Buscar movimentações..."}
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === 'stock' && (
            <Button onClick={() => {
              setEditingItem(null);
              setFormData({ name: '', quantity: 0, minQuantity: 0, unit: '', category: '' });
              setIsModalOpen(true);
            }} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Novo Item
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {activeTab === 'stock' ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                      <th className="px-6 py-4 font-semibold">Item</th>
                      <th className="px-6 py-4 font-semibold">Categoria</th>
                      <th className="px-6 py-4 font-semibold">Quantidade</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredInventory.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-900">{item.name}</span>
                            <span className="text-[10px] text-zinc-500 uppercase">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-600">{item.category}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-bold",
                              item.quantity <= item.minQuantity ? "text-red-600" : "text-zinc-900"
                            )}>
                              {item.quantity}
                            </span>
                            <span className="text-xs text-zinc-400">/ {item.minQuantity} min.</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.quantity <= item.minQuantity ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase">
                              <AlertTriangle className="h-3 w-3" />
                              Repor
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">
                              Ok
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-blue-600 hover:bg-blue-50 h-8 px-2"
                              onClick={() => handleOpenMovement(item, 'in')}
                            >
                              <ArrowUpRight className="h-4 w-4 mr-1" />
                              Entrada
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-rose-600 hover:bg-rose-50 h-8 px-2"
                              onClick={() => handleOpenMovement(item, 'out')}
                            >
                              <ArrowDownLeft className="h-4 w-4 mr-1" />
                              Saída
                            </Button>
                            <div className="w-px h-4 bg-zinc-200 mx-1" />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                              <Edit2 className="h-4 w-4 text-zinc-400" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden divide-y divide-zinc-100">
                {filteredInventory.map((item) => (
                  <div key={item.id} className="p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-zinc-900">{item.name}</h3>
                        <p className="text-[10px] text-zinc-500 uppercase">{item.category} • {item.unit}</p>
                      </div>
                      {item.quantity <= item.minQuantity ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase">
                          <AlertTriangle className="h-3 w-3" />
                          Repor
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">
                          Ok
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 uppercase font-bold">Estoque Atual</span>
                        <span className={cn(
                          "text-lg font-bold",
                          item.quantity <= item.minQuantity ? "text-red-600" : "text-zinc-900"
                        )}>
                          {item.quantity} <span className="text-xs font-normal text-zinc-500">/ {item.minQuantity} min.</span>
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 px-3 text-blue-600 border-blue-100 bg-blue-50/50"
                          onClick={() => handleOpenMovement(item, 'in')}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 px-3 text-rose-600 border-rose-100 bg-rose-50/50"
                          onClick={() => handleOpenMovement(item, 'out')}
                        >
                          <ArrowDownLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-10 gap-2" onClick={() => handleEdit(item)}>
                        <Edit2 className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-10 gap-2 text-red-600 border-red-100" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50/30">
                      <th className="px-6 py-4 font-semibold">Data</th>
                      <th className="px-6 py-4 font-semibold">Item</th>
                      <th className="px-6 py-4 font-semibold">Tipo</th>
                      <th className="px-6 py-4 font-semibold text-center">Qtd</th>
                      <th className="px-6 py-4 font-semibold">Responsável</th>
                      <th className="px-6 py-4 font-semibold">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-600">
                            {new Date(m.date).toLocaleDateString('pt-BR')} {new Date(m.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-zinc-900">{m.itemName}</span>
                        </td>
                        <td className="px-6 py-4">
                          {m.type === 'in' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">
                              <ArrowUpRight className="h-3 w-3" />
                              Entrada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold uppercase">
                              <ArrowDownLeft className="h-3 w-3" />
                              Saída
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "text-sm font-bold",
                            m.type === 'in' ? "text-blue-600" : "text-rose-600"
                          )}>
                            {m.type === 'in' ? '+' : '-'}{m.quantity}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-600">{m.userName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-500 italic">{m.reason || '-'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden divide-y divide-zinc-100">
                {filteredMovements.map((m) => (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-bold text-zinc-900">{m.itemName}</h3>
                        <p className="text-[10px] text-zinc-500 uppercase">
                          {new Date(m.date).toLocaleDateString('pt-BR')} {new Date(m.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {m.type === 'in' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">
                          <ArrowUpRight className="h-3 w-3" />
                          Entrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold uppercase">
                          <ArrowDownLeft className="h-3 w-3" />
                          Saída
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 uppercase font-bold">Quantidade</span>
                        <span className={cn(
                          "font-bold",
                          m.type === 'in' ? "text-blue-600" : "text-rose-600"
                        )}>
                          {m.type === 'in' ? '+' : '-'}{m.quantity}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-zinc-400 uppercase font-bold">Responsável</span>
                        <span className="text-zinc-600">{m.userName}</span>
                      </div>
                    </div>

                    {m.reason && (
                      <p className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded-lg border border-zinc-100 italic">
                        {m.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal for Add/Edit Item */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setShowItemConfirm(false);
          setErrors({});
          setFormData({ name: '', quantity: 0, minQuantity: 0, unit: '', category: '' });
        }} 
        title={editingItem ? "Editar Item" : "Novo Item no Estoque"}
        closeOnBackdropClick={false}
      >
        {showItemConfirm ? (
          <div className="space-y-4">
            <p className="text-zinc-700">
              Tem certeza que deseja {editingItem ? 'salvar as alterações no item' : 'adicionar este item ao estoque'}?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowItemConfirm(false)}>Cancelar</Button>
              <Button onClick={confirmItemSave}>Confirmar</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
              label="Nome do Item" 
              required 
              value={formData.name}
              error={errors.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Categoria" 
                required 
                value={formData.category}
                error={errors.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <Input 
                label="Unidade (ex: Caixa, Seringa)" 
                required 
                value={formData.unit}
                error={errors.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input 
                label="Quantidade Atual" 
                type="number"
                required 
                value={formData.quantity}
                error={errors.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
              />
              <Input 
                label="Quantidade Mínima" 
                type="number"
                required 
                value={formData.minQuantity}
                error={errors.minQuantity}
                onChange={(e) => setFormData({ ...formData, minQuantity: Number(e.target.value) })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingItem ? "Salvar Alterações" : "Adicionar ao Estoque"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <Modal
        isOpen={!!deletingItemId}
        onClose={() => setDeletingItemId(null)}
        title="Confirmar Exclusão"
        closeOnBackdropClick={false}
      >
        <div className="space-y-4">
          <p className="text-zinc-700">
            Tem certeza que deseja excluir o item{' '}
            <strong>{inventory.find(i => i.id === deletingItemId)?.name}</strong> do estoque? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingItemId(null)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>Excluir</Button>
          </div>
        </div>
      </Modal>

      {/* Modal for Movement (Entry/Exit) */}
      <Modal
        isOpen={isMovementModalOpen}
        onClose={() => {
          setIsMovementModalOpen(false);
          setShowMovementConfirm(false);
          setSelectedItemForMovement(null);
        }}
        title={movementType === 'in' ? `Entrada: ${selectedItemForMovement?.name}` : `Saída: ${selectedItemForMovement?.name}`}
        closeOnBackdropClick={false}
      >
        {showMovementConfirm ? (
          <div className="space-y-4">
            <p className="text-zinc-700">
              Tem certeza que deseja registrar a {movementType === 'in' ? 'entrada' : 'saída'} de{' '}
              <strong>{movementData.quantity} {selectedItemForMovement?.unit}</strong> de{' '}
              <strong>{selectedItemForMovement?.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMovementConfirm(false)}>Cancelar</Button>
              <Button
                className={cn(movementType === 'in' ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-600 hover:bg-rose-700")}
                onClick={confirmMovementSave}
              >
                Confirmar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleMovementSubmit} className="space-y-4">
            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 flex items-center justify-between">
              <span className="text-sm text-zinc-600">Estoque Atual:</span>
              <span className="text-sm font-bold text-zinc-900">{selectedItemForMovement?.quantity} {selectedItemForMovement?.unit}</span>
            </div>
            
            <Input 
              label="Quantidade" 
              type="number"
              min={1}
              required 
              value={movementData.quantity}
              onChange={(e) => setMovementData({ ...movementData, quantity: Number(e.target.value) })}
            />
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Motivo / Observação</label>
              <textarea 
                className="w-full min-h-[100px] p-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white text-zinc-900 text-sm outline-none"
                placeholder="Ex: Reposição mensal, Uso em procedimento, etc."
                value={movementData.reason}
                onChange={(e) => setMovementData({ ...movementData, reason: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsMovementModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className={cn(
                  movementType === 'in' ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                Confirmar {movementType === 'in' ? 'Entrada' : 'Saída'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

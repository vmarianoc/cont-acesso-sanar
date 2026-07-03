package sync

import "testing"

func TestQueuePushDrainRequeue(t *testing.T) {
	q := NewQueue()
	if q.Len() != 0 {
		t.Fatalf("fila nova deveria estar vazia, tem %d", q.Len())
	}

	for i := 0; i < 3; i++ {
		q.Push(Evento{DispositivoID: "disp-1", Tipo: "acesso"})
	}
	if q.Len() != 3 {
		t.Fatalf("esperava 3 itens na fila, tem %d", q.Len())
	}

	lote := q.DrainBatch(2)
	if len(lote) != 2 {
		t.Fatalf("esperava lote de 2, obteve %d", len(lote))
	}
	if q.Len() != 1 {
		t.Fatalf("esperava 1 item restante na fila, tem %d", q.Len())
	}

	q.Requeue(lote)
	if q.Len() != 3 {
		t.Fatalf("esperava 3 itens após requeue, tem %d", q.Len())
	}

	// DrainBatch com max maior que o disponível não deve estourar limites.
	todos := q.DrainBatch(100)
	if len(todos) != 3 || q.Len() != 0 {
		t.Fatalf("DrainBatch com max alto deveria esvaziar a fila: len=%d, restante=%d", len(todos), q.Len())
	}
}

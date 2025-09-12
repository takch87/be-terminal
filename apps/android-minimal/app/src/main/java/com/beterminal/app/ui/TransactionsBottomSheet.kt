package com.beterminal.app.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.widget.TextView
import com.beterminal.app.network.*
import kotlinx.coroutines.launch

class TransactionsBottomSheet : BottomSheetDialogFragment() {
    private var authToken: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        authToken = arguments?.getString("authToken") ?: ""
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val rv = RecyclerView(requireContext())
        rv.layoutManager = LinearLayoutManager(requireContext())
        rv.adapter = TxAdapter(mutableListOf()) { item ->
            // On refund click
            if (item.payment_intent_id != null) {
                lifecycleScope.launch {
                    val resp = ApiClient.refundPayment(authToken, RefundRequest(payment_intent_id = item.payment_intent_id))
                    if (resp.isSuccessful && (resp.body()?.success == true)) {
                        Toast.makeText(requireContext(), "Anulada", Toast.LENGTH_SHORT).show()
                        loadData(rv.adapter as TxAdapter)
                    } else {
                        Toast.makeText(requireContext(), "Error anulando", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        return rv
    }

    override fun onStart() {
        super.onStart()
        val adapter = (view as RecyclerView).adapter as TxAdapter
        loadData(adapter)
    }

    private fun loadData(adapter: TxAdapter) {
        lifecycleScope.launch {
            val resp = ApiClient.getRecentTransactions(authToken, 20)
            if (resp.isSuccessful) {
                adapter.setItems(resp.body()?.items ?: emptyList())
            }
        }
    }
}

private class TxVH(v: View) : RecyclerView.ViewHolder(v) {
    val tv: TextView = v as TextView
}

private class TxAdapter(private val items: MutableList<TransactionDto>, val onRefund: (TransactionDto) -> Unit) : RecyclerView.Adapter<TxVH>() {
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TxVH {
        val tv = TextView(parent.context)
        tv.setPadding(24, 24, 24, 24)
        tv.setOnLongClickListener {
            val position = it.tag as? Int ?: return@setOnLongClickListener false
            val item = items[position]
            onRefund(item)
            true
        }
        return TxVH(tv)
    }
    override fun onBindViewHolder(holder: TxVH, position: Int) {
        val it = items[position]
        holder.itemView.tag = position
        holder.tv.text = "${it.created_at ?: ""}  •  ${formatAmount(it.amount)}  •  ${it.status}"
    }
    override fun getItemCount(): Int = items.size
    fun setItems(newItems: List<TransactionDto>) {
        items.clear(); items.addAll(newItems); notifyDataSetChanged()
    }
    private fun formatAmount(cents: Long?): String = cents?.let { "$" + String.format("%.2f", it/100.0) } ?: "$0.00"
}
